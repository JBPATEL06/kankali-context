export async function GET() {
  return new Response("google-site-verification: google6f104555f1a86a20.html", {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
