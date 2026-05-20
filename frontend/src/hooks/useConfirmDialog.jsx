/**
 * useConfirmDialog — modal de confirmação assíncrono.
 *
 * Por que existe (auditoria de estado, 2026-05-18):
 *   Componentes como InstallerJobDetail.jsx mantinham 3 useStates só para um
 *   confirm dialog (open, message, resolve), guardando a função `resolve` de
 *   uma Promise *dentro do state* com o workaround `setX(() => resolve)` para
 *   o React não interpretar como updater. Isso é anti-pattern: state deveria
 *   ser apenas dados serializáveis, não closures.
 *
 *   Este hook coloca o resolver em `useRef` (que é o lugar certo para
 *   "valor mutável que não dispara re-render") e mantém só `{open, message}`
 *   em state. Devolve uma API imperativa `confirm(message) => Promise<bool>`
 *   e o componente JSX já renderizado.
 *
 * Uso:
 *
 *   const { confirm, Dialog } = useConfirmDialog({
 *     defaultTitle: 'Sinal GPS Fraco',
 *     confirmText: 'Continuar mesmo assim',
 *     cancelText: 'Cancelar',
 *   });
 *
 *   const proceed = await confirm('GPS impreciso (250m). Continuar?');
 *   if (!proceed) return;
 *
 *   // no JSX do componente:
 *   {Dialog}
 *
 * Cancelar (clicar fora ou no botão cancelar) resolve com `false`.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { AlertTriangle } from 'lucide-react';

export function useConfirmDialog(options = {}) {
  const {
    defaultTitle = 'Confirmar',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    icon: Icon = AlertTriangle,
    iconColor = 'text-yellow-400',
    // Permite parametrizar título por chamada também
    titleByPromise = null,
  } = options;

  // State: apenas o que afeta o render (open + texto).
  const [state, setState] = useState({ open: false, title: defaultTitle, message: '' });

  // Ref: resolver da Promise corrente. Não dispara re-render; perfeito para closures.
  const resolverRef = useRef(null);

  const settle = useCallback((answer) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setState((s) => ({ ...s, open: false }));
    // Resolve fora do setState para não bloquear o batch do React.
    if (resolve) resolve(answer);
  }, []);

  const confirm = useCallback(
    (message, perCallTitle) =>
      new Promise((resolve) => {
        // Se houver um confirm pendente (raro), descarta o anterior como cancelado.
        if (resolverRef.current) resolverRef.current(false);
        resolverRef.current = resolve;
        setState({
          open: true,
          title: perCallTitle ?? titleByPromise ?? defaultTitle,
          message: String(message ?? ''),
        });
      }),
    [defaultTitle, titleByPromise]
  );

  const DialogNode = useMemo(
    () => (
      <Dialog
        open={state.open}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <DialogContent className="bg-card border-white/10 max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {Icon && <Icon className={`h-5 w-5 ${iconColor}`} />}
              {state.title}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-2 whitespace-pre-line">
              {state.message}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 h-11 border-white/20 text-white hover:bg-white/10"
              onClick={() => settle(false)}
            >
              {cancelText}
            </Button>
            <Button
              className="flex-1 h-11 bg-primary hover:bg-primary/90 active:scale-[0.98] transition-transform"
              onClick={() => settle(true)}
            >
              {confirmText}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
    [state.open, state.title, state.message, settle, cancelText, confirmText, Icon, iconColor]
  );

  return { confirm, Dialog: DialogNode };
}

export default useConfirmDialog;
