Corrija os bugs encontrados na auditoria de código do projeto instal-visual.com.br (pasta: C:\Users\andre\Downloads\claude\Instal-supa\supabase).

Leia o arquivo AUDITORIA-CODIGO-2026-06-10.md para entender todos os problemas. Depois corrija na seguinte ordem:

1. Users.jsx ~linha 36 — adicionar `else { setLoading(false) }` no useEffect
2. Checkins.jsx ~linha 338 — adicionar `|| []` no setInstallers
3. Login.jsx ~linha 117 — trocar `© 2025` por `© {new Date().getFullYear()}`
4. config.py ~linha 47 — trocar default do VAPID_CLAIMS_EMAIL para `noreply@instal-visual.com.br`
5. jobs.py ~linhas 113,2193 — mover emails hardcoded para env var e remover do response JSON
6. auth_new.py ~linhas 498-511 — separar o try/except da validação de expiração do token
7. visitas.py ~linhas 59-69 — adicionar TTL de 300s no _installer_name_cache
8. Calendar.jsx ~linha 108 — adicionar toast.warning quando listVisitas falhar
9. vercel.json — adicionar headers CSP sem quebrar o experimentalServices existente

Após cada arquivo alterado, confirme o que mudou. Ao final, rode `npm run build` no frontend para garantir que não há erros.
