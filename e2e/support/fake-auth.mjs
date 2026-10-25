// Local stand-in for Supabase Auth's "who is this token?" endpoint, for the browser smoke tests
// only. It trusts the token it's given, so it must never be pointed at by a real deployment.
// Port: FAKE_AUTH_PORT (5700).
import http from "node:http";

http
  .createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/health") return res.end('{"ok":true}');
    const auth = req.headers.authorization ?? "";
    if (req.url.startsWith("/auth/v1/user") && auth.startsWith("Bearer ")) {
      const payload = JSON.parse(Buffer.from(auth.slice(7).split(".")[1], "base64url").toString());
      res.end(
        JSON.stringify({
          id: payload.sub,
          aud: "authenticated",
          role: "authenticated",
          email: payload.email,
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  })
  .listen(Number(process.env.FAKE_AUTH_PORT ?? 5700), "127.0.0.1", () =>
    console.log("fake auth ready"),
  );
