# 🔧 INSTRUÇÕES PARA LIMPAR CACHE E VER AS ATUALIZAÇÕES

## O PROBLEMA:
O PWA (Progressive Web App) tem um Service Worker que mantém cache muito agressivo. Isso faz com que você veja a versão antiga mesmo após atualizações.

## SOLUÇÃO COMPLETA - SIGA TODOS OS PASSOS:

### OPÇÃO 1: Chrome/Edge (MAIS FÁCIL)

1. **Abra o DevTools:**
   - Pressione `F12` ou `Ctrl + Shift + I`

2. **Vá para Application:**
   - Clique na aba "Application" no topo do DevTools
   - Se não ver, clique nos `>>` para mostrar mais abas

3. **Desregistrar Service Worker:**
   - No menu lateral esquerdo, clique em "Service Workers"
   - Você verá algo como "https://siteflow-14.preview.emergentagent.com"
   - Clique no botão "Unregister" ao lado
   - Marque a caixa "Update on reload"

4. **Limpar Cache:**
   - No menu lateral, clique em "Storage"
   - Clique no botão "Clear site data"
   - Confirme

5. **Hard Reload:**
   - Pressione `Ctrl + Shift + R` (Windows/Linux)
   - Ou `Cmd + Shift + R` (Mac)
   - Ou clique com botão direito no botão de reload e selecione "Empty Cache and Hard Reload"

6. **Feche e reabra o navegador**

---

### OPÇÃO 2: Firefox

1. **Abra o DevTools:**
   - Pressione `F12` ou `Ctrl + Shift + I`

2. **Vá para Storage:**
   - Clique na aba "Storage"
   
3. **Limpar Service Workers:**
   - Clique em "Service Workers" no menu lateral
   - Clique em "Unregister"

4. **Limpar todos os dados:**
   - Clique com botão direito em "https://siteflow-14.preview.emergentagent.com"
   - Selecione "Delete All"

5. **Hard Reload:**
   - Pressione `Ctrl + Shift + R`

6. **Feche e reabra o navegador**

---

### OPÇÃO 3: Limpar TUDO (Se as opções acima não funcionarem)

1. **Pressione `Ctrl + Shift + Delete`** (Windows/Linux) ou `Cmd + Shift + Delete` (Mac)

2. **Selecione:**
   - ✅ Cookies e outros dados de sites
   - ✅ Imagens e arquivos em cache
   - ✅ Intervalo de tempo: "Todo o período" ou "Última hora"

3. **Clique em "Limpar dados"**

4. **Feche COMPLETAMENTE o navegador** (não apenas a aba)

5. **Reabra e acesse:** https://siteflow-14.preview.emergentagent.com

---

### OPÇÃO 4: Modo Anônimo/Privado (Para testar rapidamente)

1. **Abra uma janela anônima:**
   - Chrome: `Ctrl + Shift + N`
   - Firefox: `Ctrl + Shift + P`
   - Edge: `Ctrl + Shift + N`

2. **Acesse:** https://siteflow-14.preview.emergentagent.com

3. **Faça login e teste**

---

## ✅ O QUE VOCÊ DEVE VER APÓS LIMPAR O CACHE:

### Na página de JOBS:
- Status coloridos:
  - 🟡 AGUARDANDO (amarelo)
  - 🔵 INSTALANDO (azul)
  - 🟠 PAUSADO (laranja)
  - 🟢 FINALIZADO (verde)
  - 🔴 ATRASADO (vermelho)

### No MENU LATERAL:
- ✅ Dashboard
- ✅ Jobs
- ✅ **Check-ins** (NOVO!)
- ✅ **Relatórios** (NOVO!)
- ✅ Calendário
- ✅ Métricas

### Na página de DETALHES DO JOB:
- Botão "Alterar Status"
- **Seção "Check-ins Realizados"** com:
  - Nome do instalador
  - Data e hora
  - Fotos de check-in e check-out
  - Coordenadas GPS (latitude, longitude, precisão)
  - Link "Ver no Google Maps"
  - Duração do trabalho
  - Observações

---

## 🚨 SE AINDA NÃO FUNCIONAR:

Tente em outro navegador (Chrome, Firefox, Edge) ou em outro dispositivo.

O problema é 100% cache local no seu navegador.
