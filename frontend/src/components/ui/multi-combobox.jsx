import * as React from 'react';
import { Check, ChevronsUpDown, X, Plus } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { Badge } from './badge';
import { cn } from '../../lib/utils';

export function MultiCombobox({ options = [], value = [], onChange, placeholder = 'Selecionar...', searchPlaceholder = 'Buscar...', creatable = false, onCreate, className }) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const toggle = (item) => {
    const next = value.includes(item) ? value.filter(v => v !== item) : [...value, item];
    onChange(next);
  };

  const handleCreate = async () => {
    if (!search.trim() || !onCreate) return;
    const newItem = await onCreate(search.trim());
    if (newItem) {
      onChange([...value, newItem]);
      setSearch('');
    }
  };

  // Safely extract a display string from a value (handles plain strings or {value,label} objects)
  const toStr = (v) => typeof v === 'string' ? v : (v?.label ?? v?.value ?? String(v));

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className={cn("space-y-2", className)}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((v, idx) => (
            <Badge key={typeof v === 'string' ? v : idx} variant="secondary" className="bg-primary/20 text-primary border-primary/30 gap-1">
              {toStr(v)}
              <button onClick={() => toggle(v)} className="hover:text-red-400 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="w-full justify-between bg-background border-white/10 text-white hover:bg-white/5 font-normal text-muted-foreground"
          >
            {value.length === 0 ? placeholder : `${value.length} selecionado(s)`}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0 bg-card border-white/10 z-50">
          <Command className="bg-transparent" shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              className="text-white"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandGroup>
                {filtered.map(opt => (
                  <CommandItem
                    key={opt.value}
                    onSelect={() => toggle(opt.value)}
                    className="text-white hover:bg-white/5 cursor-pointer"
                  >
                    <Check className={cn("mr-2 h-4 w-4", value.includes(opt.value) ? "opacity-100" : "opacity-0")} />
                    {opt.label}
                  </CommandItem>
                ))}
                {creatable && search.trim() && !filtered.some(o => o.label.toLowerCase() === search.toLowerCase()) && (
                  <CommandItem
                    onSelect={handleCreate}
                    className="text-primary hover:bg-white/5 cursor-pointer"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar "{search.trim()}"
                  </CommandItem>
                )}
              </CommandGroup>
              {filtered.length === 0 && !creatable && (
                <CommandEmpty>Nenhum resultado</CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
