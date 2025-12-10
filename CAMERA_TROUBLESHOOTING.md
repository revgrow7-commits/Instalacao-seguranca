# Troubleshooting da Câmera - Check-in/Check-out

## 🔍 Diagnóstico do Problema

Se a câmera não está abrindo, verifique:

### 1. Permissões do Navegador

**Chrome/Edge:**
1. Clique no ícone de cadeado/câmera na barra de endereço
2. Procure por "Câmera" nas permissões
3. Mude para "Permitir"
4. Recarregue a página

**Safari (iOS):**
1. Vá em Ajustes > Safari > Câmera
2. Selecione "Perguntar" ou "Permitir"
3. Volte ao site e permita quando solicitado

**Firefox:**
1. Clique no ícone de permissões na barra de endereço
2. Permita o acesso à câmera
3. Recarregue a página

### 2. HTTPS Obrigatório

A API de câmera **só funciona com HTTPS** (exceto localhost).

**URL Atual:** Verifique se começa com `https://`

Se estiver usando HTTP, a câmera **não funcionará**.

### 3. Console do Navegador

Abra o console (F12) e procure por erros:

```
Camera error: NotAllowedError
→ Usuário negou permissão

Camera error: NotFoundError
→ Dispositivo não tem câmera

Camera error: NotReadableError
→ Câmera em uso por outro app

Camera error: OverconstrainedError
→ Configurações não suportadas
```

### 4. Teste Manual

Cole no console do navegador:

```javascript
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    console.log('✅ Câmera funcionando!', stream);
    stream.getTracks().forEach(track => track.stop());
  })
  .catch(error => {
    console.error('❌ Erro na câmera:', error.name, error.message);
  });
```

## 🔧 Soluções Comuns

### Erro: "Timeout expired" no GPS
- **Solução**: Aguarde até 30 segundos
- **Alternativa**: Saia para área aberta (melhor sinal)
- **Botão**: Clique em "🔄 Tentar Novamente"

### Erro: "NotAllowedError"
- **Causa**: Permissão negada
- **Solução**: Permitir câmera nas configurações do navegador
- **Reiniciar**: Fechar e abrir o site novamente

### Erro: "NotFoundError"
- **Causa**: Dispositivo sem câmera
- **Solução**: Usar dispositivo com câmera
- **Alternativa**: Testar em outro dispositivo/navegador

### Erro: "NotReadableError"
- **Causa**: Câmera em uso
- **Solução**: Fechar outros apps que usam câmera
- **Apps comuns**: Zoom, Teams, WhatsApp Web, Instagram

### Câmera preta ou congelada
- **Solução 1**: Recarregar página (F5)
- **Solução 2**: Fechar e reabrir navegador
- **Solução 3**: Reiniciar dispositivo

## 📱 Compatibilidade

### Navegadores Suportados
- ✅ Chrome 53+ (Android/Desktop)
- ✅ Safari 11+ (iOS/macOS)
- ✅ Firefox 36+
- ✅ Edge 79+
- ❌ Internet Explorer (não suportado)

### Dispositivos
- ✅ Smartphones Android (Chrome)
- ✅ iPhone/iPad (Safari)
- ✅ Laptops com webcam
- ⚠️ Tablets (depende do modelo)

## 🐛 Depuração Avançada

### Ver logs da câmera
Abra o console (F12) e procure por:
```
Starting camera...
Stream obtained, setting video source
Video metadata loaded
Video playing
✅ Camera active!
```

### Verificar permissões do site
Chrome: `chrome://settings/content/camera`
Firefox: `about:preferences#privacy`
Safari: Ajustes > Safari > Configurações de Sites

### Testar no navegador sem cache
- Chrome: Ctrl+Shift+N (modo anônimo)
- Safari: Cmd+Shift+N (navegação privada)
- Firefox: Ctrl+Shift+P (janela privada)

## 📞 Suporte

Se nenhuma solução funcionou:

1. **Informações necessárias:**
   - Navegador e versão (ex: Chrome 120)
   - Sistema operacional (ex: Android 14)
   - Erro específico do console
   - Screenshot do erro

2. **Teste básico:**
   - Acesse https://www.onlinemictest.com/webcam-test/
   - Se funcionar lá mas não no site, é problema do código
   - Se não funcionar, é problema do dispositivo/permissões

## ✅ Checklist Rápido

- [ ] URL começa com `https://`?
- [ ] Permissão de câmera concedida no navegador?
- [ ] Outros apps usando câmera foram fechados?
- [ ] Navegador moderno e atualizado?
- [ ] Console mostra algum erro específico?
- [ ] Testou em outro navegador/dispositivo?
- [ ] GPS também está funcionando?

---

**Última atualização:** 10/12/2025
**Versão do sistema:** 1.0
