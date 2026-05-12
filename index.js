/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
};

/**
 * دالة مساعدة لإرسال ردود بصيغة JSON مع رؤوس CORS
 */
const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        if (url.pathname === '/' || url.pathname === '') {
            return jsonResponse({ status: "running", message: "نظام إدارة الملفات يعمل بنجاح" });
        }

        // نقطة نهاية لجلب قائمة الملفات
        if (url.pathname === '/files-list' && request.method === 'GET') {
            try {
                const { results } = await env.DB.prepare(
                    "SELECT id, original_name, stored_name, upload_date FROM uploaded_files ORDER BY upload_date DESC"
                ).all();

                return jsonResponse(results);
            } catch (error) {
                console.error('Error fetching files from D1:', error);
                return jsonResponse({ error: 'تعذر جلب قائمة الملفات' }, 500);
            }
        }

        // نقطة نهاية لرفع الملفات (سنقوم بتطويرها لاحقاً لتخزين الملفات في R2)
        if (url.pathname === '/upload' && request.method === 'POST') {
            try {
                const formData = await request.formData();
                const file = formData.get('file');

                if (!file) {
                    return jsonResponse({ error: 'لم يتم اختيار ملف' }, 400);
                }

                const id = crypto.randomUUID(); // إنشاء ID فريد
                // تنظيف اسم الملف من الرموز التي قد تسبب مشاكل في الروابط
                const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const storedName = `${id}-${originalName}`;
                const uploadDate = new Date().toISOString();

                await env.DB.prepare(
                    "INSERT INTO uploaded_files (id, original_name, stored_name, upload_date) VALUES (?, ?, ?, ?)"
                ).bind(id, originalName, storedName, uploadDate)
                    .run();

                // رفع الملف إلى Cloudflare R2
                await env.R2_BUCKET.put(storedName, file.stream(), {
                    httpMetadata: {
                        contentType: file.type,
                    },
                });

                return jsonResponse({ message: 'تم رفع الملف وتنظيمه بنجاح!', id, original_name: originalName, stored_name: storedName });
            } catch (error) {
                console.error('Error uploading file data to D1:', error);
                return jsonResponse({ error: 'حدث خطأ أثناء الرفع' }, 500);
            }
        }

        // نقطة نهاية لتحميل الملفات من R2
        if (url.pathname.startsWith('/download/') && request.method === 'GET') {
            const storedName = url.pathname.substring('/download/'.length);

            try {
                const object = await env.R2_BUCKET.get(storedName);

                if (!object) {
                    return jsonResponse({ error: 'الملف غير موجود' }, 404);
                }

                const headers = new Headers();
                object.writeHttpMetadata(headers);
                headers.set('Content-Type', object.httpMetadata.contentType || 'application/octet-stream');
                // الـ UUID دائماً 36 حرفاً + الشرطة = 37 حرفاً
                const originalFileName = object.key.length > 37 ? object.key.substring(37) : object.key;
                headers.set('Content-Disposition', `attachment; filename="${originalFileName}"`);

                // دمج رؤوس CORS مع رؤوس الملف
                Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));

                return new Response(object.body, { headers });
            } catch (error) {
                console.error('Error downloading file from R2:', error);
                return jsonResponse({ error: 'حدث خطأ أثناء تحميل الملف' }, 500);
            }
        }

        return jsonResponse({ error: 'Not Found' }, 404);
    },
};