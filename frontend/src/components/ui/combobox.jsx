import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { cn } from '../../lib/utils';

export function Combobox({ options = [], value, onChange, placeholder = 'Selecionar...', searchPlaceholder = 'Buscar...', emptyText = 'Nenhum resultado', creatable = false, onCreate, onCreateOption, className }) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o => (o.label ?? '').toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async () => {
    const term = search.trim();
    if (!term) return;
    if (onCreate) {
      await onCreate(term);
    } else if (onCreateOption) {
      onCreateOption();
    }
    setOpen(false);
    setSearch('');
  };

  const showCreateOption = creatable && search.trim() &&
    !filtered.some(o => (o.label ?? '').toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
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
        <Command className="bg-transparent" shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} className="text-white" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandGroup>
              {filtered.map(opt => (
                <CommandItem
                  key={opt.value}
                  onSelect={() => { onChange(opt.value === value ? '' : opt.value); setOpen(false); setSearch(''); }}
                  className="text-white hover:bg-white/5 cursor-pointer"
                >
                  <Check className={cn("mr-2 h-4 w-4", value === opt.value ? "opacity-100" : "opacity-0")} />
                  {opt.label}
                </CommandItem>
              ))}
              {showCreateOption && (
                <CommandItem
                  onSelect={handleCreate}
                  className="text-primary hover:bg-white/5 cursor-pointer"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar "{search.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
            {filtered.length === 0 && !showCreateOption && (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
