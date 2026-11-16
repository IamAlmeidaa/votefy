import { createFileRoute } from "@tanstack/react-router";
import { Buffer } from "node:buffer";

const SESSION_COOKIE = "votefy_session";

function readSessionCookie(cookieHeader: string | null): string | null {
  const value = cookieHeader
    ?.split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? "; Secure" : ""}`;
}

function expiredCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { getAuthSession, getUserProfile, getProfileImage } = await import("@/lib/neon-database.server");
          const user = await getAuthSession(readSessionCookie(request.headers.get("cookie")));
          const image = new URL(request.url).searchParams.get("image");
          if (image === "avatar" || image === "banner") {
            if (!user) return new Response(null, { status: 401, headers: { "Cache-Control": "private, no-store" } });
            const asset = await getProfileImage(user.id, image);
            if (!asset) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
            return new Response(new Uint8Array(asset.bytes), { headers: { "Content-Type": asset.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
          }
          if (new URL(request.url).searchParams.get("view") === "profile") {
            if (!user) return Response.json({ error: "Entre na sua conta para acessar o perfil." }, { status: 401 });
            const profile = await getUserProfile(user.id);
            if (!profile) return Response.json({ error: "Perfil não encontrado." }, { status: 404 });
            return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
          }
          if (!user) return Response.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
          return Response.json(
            { user: { id: user.id, username: user.username } },
            { headers: { "Cache-Control": "no-store" } }
          );
        } catch {
          return Response.json({ error: "Não foi possível restaurar sua sessão." }, { status: 503 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const origin = request.headers.get("origin");
          if (!origin || origin !== new URL(request.url).origin) {
            return Response.json({ error: "Solicitação inválida." }, { status: 403 });
          }
          const { revokeAuthSession } = await import("@/lib/neon-database.server");
          await revokeAuthSession(readSessionCookie(request.headers.get("cookie")));
          const secure = new URL(request.url).protocol === "https:";
          return Response.json({ ok: true }, { headers: { "Set-Cookie": expiredCookie(secure) } });
        } catch {
          return Response.json({ error: "Não foi possível encerrar a sessão." }, { status: 503 });
        }
      },
      POST: async ({ request }) => {
        try {
          const origin = request.headers.get("origin");
          if (!origin || origin !== new URL(request.url).origin) {
            return Response.json({ error: "Solicitação inválida." }, { status: 403 });
          }
          const contentLength = Number(request.headers.get("content-length") || 0);
          if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
            if (contentLength > 6 * 1024 * 1024 + 65536) return Response.json({ error: "O arquivo enviado excede o limite permitido." }, { status: 413 });
            const { getAuthSession, storeProfileImage, getUserProfile } = await import("@/lib/neon-database.server");
            const sessionUser = await getAuthSession(readSessionCookie(request.headers.get("cookie")));
            if (!sessionUser) return Response.json({ error: "Entre na sua conta para continuar." }, { status: 401 });
            const form = await request.formData();
            const kind = form.get("kind");
            const file = form.get("file");
            if ((kind !== "avatar" && kind !== "banner") || !(file instanceof File)) return Response.json({ error: "Escolha uma imagem vÃ¡lida." }, { status: 400 });
            const limit = kind === "avatar" ? 4 * 1024 * 1024 : 6 * 1024 * 1024;
            if (file.size <= 0 || file.size > limit) return Response.json({ error: `A imagem deve ter no mÃ¡ximo ${kind === "avatar" ? 4 : 6} MB.` }, { status: 413 });
            const bytes = Buffer.from(await file.arrayBuffer());
            const signatures: Record<string, number[]> = { "image/png": [137,80,78,71,13,10,26,10], "image/jpeg": [255,216,255], "image/gif": [71,73,70,56], "image/webp": [82,73,70,70] };
            const signature = signatures[file.type];
            const valid = Boolean(signature && signature.every((byte, index) => bytes[index] === byte) && (file.type !== "image/webp" || bytes.toString("ascii", 8, 12) === "WEBP"));
            if (!valid) return Response.json({ error: "Use um arquivo PNG, JPEG, WebP ou GIF vÃ¡lido." }, { status: 400 });
            await storeProfileImage(sessionUser.id, kind, file.type, bytes);
            const profile = await getUserProfile(sessionUser.id);
            return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
          }
          if (contentLength > 8192 && !request.headers.get("content-type")?.startsWith("multipart/form-data")) {
            return Response.json({ error: "Solicitação muito grande." }, { status: 413 });
          }
          const rawBody = await request.text();
          if (rawBody.length > 8192) {
            return Response.json({ error: "Solicitação muito grande." }, { status: 413 });
          }
          const body = JSON.parse(rawBody) as {
            action?: "login" | "register" | "profile" | "listen" | "redeem" | "equip";
            username?: string;
            password?: string;
            confirmPassword?: string;
            nickname?: string;
            caption?: string;
            bio?: string;
            border_color?: string;
            decorationId?: string | null;
          };

          const db = await import("@/lib/neon-database.server");
          if (["profile", "listen", "redeem", "equip"].includes(body.action || "")) {
            const sessionUser = await db.getAuthSession(readSessionCookie(request.headers.get("cookie")));
            if (!sessionUser) return Response.json({ error: "Entre na sua conta para continuar." }, { status: 401 });
            if (body.action === "listen") {
              await db.recordListenedMinute(sessionUser.id);
              return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
            }
            if (body.action === "redeem") {
              const profile = await db.redeemProfileDecoration(sessionUser.id, body.decorationId ?? "");
              return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
            }
            if (body.action === "equip") {
              const profile = await db.equipProfileDecoration(sessionUser.id, body.decorationId ?? null);
              return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
            }
            const profile = await db.updateUserProfile(sessionUser.id, {
              nickname: body.nickname ?? "",
              caption: body.caption ?? "",
              bio: body.bio ?? "",
              border_color: body.border_color ?? "#e74646",
            });
            return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
          }

          const user = body.action === "register"
            ? await db.registerUser(body.username ?? "", body.password ?? "", body.confirmPassword ?? "")
            : body.action === "login"
              ? await db.loginUser(body.username ?? "", body.password ?? "")
              : null;

          if (!user) return Response.json({ error: "Ação inválida." }, { status: 400 });
          const token = await db.createAuthSession(user.id);
          const secure = new URL(request.url).protocol === "https:";
          return Response.json(
            { id: user.id, username: user.username },
            {
              status: body.action === "register" ? 201 : 200,
              headers: { "Set-Cookie": sessionCookie(token, secure), "Cache-Control": "no-store" },
            }
          );
        } catch (error) {
          if (error instanceof SyntaxError) {
            return Response.json({ error: "Solicitação inválida." }, { status: 400 });
          }
          const message = error instanceof Error ? error.message : "Erro ao autenticar.";
          const expected = [
            "Informe um nome de usuário.",
            "Informe uma senha.",
            "A senha deve ter entre 10 e 128 caracteres.",
            "Use até 32 letras, números, ponto, hífen ou sublinhado no usuário.",
            "A senha e a confirmação de senha não coincidem.",
            "Este nome de usuário já está em uso.",
            "Preencha usuário e senha.",
            "Usuário ou senha inválidos.",
            "Perfil não encontrado.",
          ];
          if (
            expected.includes(message) ||
            message.startsWith("O apelido") ||
            message.startsWith("A legenda") ||
            message.startsWith("A bio") ||
            message.startsWith("Escolha uma cor") ||
            message.startsWith("A foto de perfil") ||
            message.startsWith("O plano de fundo") ||
            message.startsWith("Orbs insuficientes") ||
            message.startsWith("Resgate esta decora") ||
            message.startsWith("Decora")
          ) return Response.json({ error: message }, { status: 400 });
          console.error("Falha no endpoint de autenticação:", error);
          return Response.json({ error: "Não foi possível autenticar agora." }, { status: 503 });
        }
      },
    },
  },
});
