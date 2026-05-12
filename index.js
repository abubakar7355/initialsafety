/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // معالجة طلبات CORS Preflight (OPTIONS)
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Access-Control-Max-Age": "86400",
                },
            });
        }

        // نقطة نهاية لجلب قائمة الملفات
        if (url.pathname === '/files-list' && request.method === 'GET') {
            try {
                // استخدام DB (الذي تم ربطه في wrangler.toml) للوصول إلى D1
                const { results } = await env.DB.prepare(
                    "SELECT id, original_name, stored_name, upload_date FROM uploaded_files ORDER BY upload_date DESC"
                ).all();

                return new Response(JSON.stringify(results), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*', // للسماح للواجهة الأمامية بالوصول
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                    },
                });
            } catch (error) {
                console.error('Error fetching files from D1:', error);
                return new Response('تعذر جلب قائمة الملفات.', { status: 500 });
            }
        }

        // نقطة نهاية لرفع الملفات (سنقوم بتطويرها لاحقاً لتخزين الملفات في R2)
        if (url.pathname === '/upload' && request.method === 'POST') {
            try {
                // في هذه المرحلة، سنقوم فقط بحفظ البيانات الوصفية في D1
                // تخزين الملف الفعلي في R2 سيكون في خطوة لاحقة
                const formData = await request.formData();
                const file = formData.get('file');

                if (!file) {
                    return new Response('لم يتم اختيار ملف.', { status: 400 });
                }

                const id = crypto.randomUUID(); // إنشاء ID فريد
                const originalName = file.name;
                const storedName = `${id}-${originalName}`; // اسم فريد للملف لـ R2
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

                return new Response(JSON.stringify({ message: 'تم رفع الملف وتنظيمه بنجاح!', id: id, original_name: originalName, stored_name: storedName }), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Max-Age': '86400', // Cache preflight requests for 24 hours
                    },
                });
            } catch (error) {
                console.error('Error uploading file data to D1:', error);
                return new Response('حدث خطأ أثناء الرفع.', { status: 500 });
            }
        }

        // نقطة نهاية لتحميل الملفات من R2
        if (url.pathname.startsWith('/download/') && request.method === 'GET') {
            const storedName = url.pathname.substring('/download/'.length);

            try {
                const object = await env.R2_BUCKET.get(storedName);

                if (!object) {
                    return new Response('الملف غير موجود.', { status: 404 });
                }

                const headers = new Headers();
                object.writeHttpMetadata(headers);
                headers.set('Content-Type', object.httpMetadata.contentType || 'application/octet-stream');
                headers.set('Content-Disposition', `attachment; filename="${object.key.split('-').slice(1).join('-')}"`); // استخدام الاسم الأصلي للملف
                headers.set('Access-Control-Allow-Origin', '*');

                return new Response(object.body, { headers });
            } catch (error) {
                console.error('Error downloading file from R2:', error);
                return new Response('حدث خطأ أثناء تحميل الملف.', { status: 500 });
            }
        }

        return new Response('Not Found', { status: 404 });
    },
};