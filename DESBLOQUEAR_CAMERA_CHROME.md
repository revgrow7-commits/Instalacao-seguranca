# 📸 Como Desbloquear a Câmera no Chrome

## 🚨 Problema
O Chrome **não está mostrando o popup** para autorizar a câmera porque ela foi **bloqueada anteriormente**.

## ✅ Solução Rápida (5 passos)

### Passo 1: Localizar o Ícone de Permissões
Na barra de endereço do Chrome, procure por um destes ícones:
- 🔒 **Cadeado** (esquerda da URL)
- 📷 **Câmera com X** (câmera bloqueada)
- ⓘ **Informações do site**

### Passo 2: Clicar no Ícone
Clique no ícone para abrir o menu de permissões.

### Passo 3: Encontrar "Câmera"
No menu que abrir, procure pela linha que diz:
```
Câmera: Bloquear
```
ou
```
Camera: Block
```

### Passo 4: Mudar para "Permitir"
Clique na opção e mude de **"Bloquear"** para **"Permitir"**

### Passo 5: Recarregar a Página
- Clique no botão de recarregar
- Ou pressione **F5**
- Ou pressione **Ctrl+R** (Windows) / **Cmd+R** (Mac)

---

## 📱 Instruções Detalhadas para Mobile

### Chrome Android

1. **Toque no ícone de 3 pontos** (⋮) no canto superior direito
2. Selecione **"Configurações"**
3. Vá em **"Configurações do site"**
4. Toque em **"Câmera"**
5. Encontre o site `emergentagent.com` na lista
6. Toque nele
7. Mude de **"Bloquear"** para **"Permitir"**
8. Volte ao site e recarregue

### Safari iOS (iPhone/iPad)

1. Saia do Safari
2. Abra **Ajustes** do iOS
3. Role para baixo e toque em **"Safari"**
4. Toque em **"Câmera"**
5. Selecione **"Perguntar"** ou **"Permitir"**
6. Volte ao Safari e recarregue a página

---

## 🖥️ Método Alternativo (Chrome Desktop)

### Através das Configurações do Chrome

1. Abra o Chrome
2. Digite na barra de endereço:
   ```
   chrome://settings/content/camera
   ```
3. Pressione Enter
4. Procure o site na lista **"Bloquear"**
5. Clique no ícone de **lixeira** (🗑️) para remover o bloqueio
6. Volte ao site e recarregue

---

## 🔍 Como Verificar se Funcionou

### Teste 1: Verificar Ícone
Após desbloquear, o ícone na barra de endereço deve mudar:
- ❌ **Antes**: 📷 com X vermelho
- ✅ **Depois**: 🔒 cadeado normal

### Teste 2: Clicar em "Abrir Câmera"
1. Volte à página de check-in
2. Clique no botão **"Abrir Câmera"**
3. **O que deve acontecer:**
   - Preview da câmera aparece imediatamente
   - Toast verde: "Câmera aberta!"

### Teste 3: Console do Navegador
1. Pressione **F12** para abrir o console
2. Cole este código:
   ```javascript
   navigator.mediaDevices.getUserMedia({ video: true })
     .then(() => console.log('✅ Câmera funcionando!'))
     .catch(e => console.error('❌ Erro:', e.name));
   ```
3. Pressione Enter
4. Deve aparecer: **"✅ Câmera funcionando!"**

---

## ❓ Perguntas Frequentes

### P: Mudei para "Permitir" mas não funcionou
**R:** Certifique-se de **recarregar a página** (F5) após mudar a permissão.

### P: Não vejo o ícone de cadeado/câmera
**R:** Pode estar usando HTTP ao invés de HTTPS. Verifique se a URL começa com `https://`

### P: O ícone diz "Não seguro"
**R:** Você está usando HTTP. A câmera **só funciona com HTTPS**. Use: `https://prodtrak.preview.emergentagent.com`

### P: Removi o bloqueio mas continua bloqueado
**R:** 
1. Feche TODAS as abas do site
2. Feche o Chrome completamente
3. Abra o Chrome novamente
4. Acesse o site de novo

### P: Funciona em outro site mas não neste
**R:** As permissões são por site. Você bloqueou especificamente este site, precisa desbloquear.

---

## 🎯 Atalhos Rápidos

### Desbloquear Tudo de Uma Vez

Se quiser limpar TODAS as permissões do site:

1. Cole na barra de endereço:
   ```
   chrome://settings/content/siteDetails?site=https://prodtrak.preview.emergentagent.com
   ```
2. Role até "Câmera"
3. Mude para "Permitir"
4. Role até "Localização" (GPS)
5. Mude para "Permitir"
6. Recarregue o site

---

## 🆘 Ainda Não Funciona?

Se após seguir todos os passos ainda não funcionar:

### Verificação Final

1. ✅ URL começa com `https://`?
2. ✅ Permissão de câmera está "Permitir"?
3. ✅ Recarregou a página (F5)?
4. ✅ Nenhum outro app usando câmera?
5. ✅ Chrome atualizado (versão 90+)?

### Teste em Modo Anônimo

1. Pressione **Ctrl+Shift+N** (Windows) ou **Cmd+Shift+N** (Mac)
2. Acesse o site na janela anônima
3. Autorize a câmera quando pedir
4. Se funcionar → problema era cache/permissão antiga
5. Se não funcionar → problema é do navegador/dispositivo

### Reiniciar Chrome

1. Feche TODAS as janelas do Chrome
2. No Windows: Verifique se não há Chrome na barra de tarefas
3. No Mac: Cmd+Q para fechar completamente
4. Abra o Chrome novamente
5. Acesse o site e tente novamente

---

## 📞 Suporte Técnico

Se nada funcionou, forneça estas informações:

```
Navegador: Chrome [versão]
Sistema: Windows/Mac/Android/iOS [versão]
URL acessada: https://...
Erro no console: [copie e cole]
Testou em outro site? Sim/Não
Funciona em modo anônimo? Sim/Não
```

---

**Última atualização:** 10/12/2025
**Versão:** 1.0
