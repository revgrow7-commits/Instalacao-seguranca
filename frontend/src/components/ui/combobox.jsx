import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { cn } from '../../lib/utils';

export function Combobox({ options = [], value, onChange, placeholder = 'Selecionar...', searchPlaceholder = 'Buscar...', emptyText = 'Nenhum resultado', creatable = false, onCreateOption, className }) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between bg-background border-white/10 text-white hover:bg-white/5 font-normal", !selected && "text-muted-foreground", className)}
        >
          {selected?.label ?? placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 bg-card border-white/10">
        <Command className="bg-transparent">
          <CommandInput placeholder={searchPlaceholder} className="text-white" />
          <CommandList>
            <CommandEmpty>
              {creatable && onCreateOption ? (
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-primary hover:bg-white/5"
                  onClick={() => { onCreateOption(); setOpen(false); }}
                >
                  <Plus className="h-4 w-4" /> Adicionar novo
                </button>
              ) : emptyText}
            </CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  onSelect={() => { onChange(opt.value === value ? '' : opt.value); setOpen(false); }}
                  className="text-white hover:bg-white/5 cursor-pointer"
                >
                  <Check className={cn("mr-2 h-4 w-4", value === opt.value ? "opacity-100" : "opacity-0")} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
