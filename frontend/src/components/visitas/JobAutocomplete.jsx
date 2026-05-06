import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import api from '../../utils/api';

export function JobAutocomplete({ value, onSelect, className }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const debounceRef = React.useRef(null);

  React.useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchJobs(query);
        setResults(res.data || []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleSelect = (job) => {
    onSelect(job);
    setOpen(false);
    setQuery(job.holdprint_job_id || job.title || '');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setQuery('');
    setResults([]);
    onSelect(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-between bg-background border-white/10 text-white hover:bg-white/5 font-normal ${className || ''}`}
          onClick={() => setOpen(true)}
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={value ? 'text-white' : 'text-muted-foreground'}>
              {value ? `${value.holdprint_job_id || ''} — ${value.client_name || value.title || ''}` : 'Buscar Job/OS (opcional)'}
            </span>
          </span>
          {value && (
            <X className="h-4 w-4 text-muted-foreground hover:text-white shrink-0" onClick={handleClear} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0 bg-card border-white/10">
        <Command className="bg-transparent" shouldFilter={false}>
          <CommandInput
            placeholder="Digite nº OS ou nome do cliente..."
            className="text-white"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && <div className="py-3 text-center text-sm text-muted-foreground">Buscando...</div>}
            {!loading && query.trim() && results.length === 0 && <CommandEmpty>Nenhum job encontrado</CommandEmpty>}
            <CommandGroup>
              {results.map(job => (
                <CommandItem
                  key={job.id}
                  onSelect={() => handleSelect(job)}
                  className="text-white hover:bg-white/5 cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-mono text-primary">{job.holdprint_job_id}</span>
                    <span className="text-sm">{job.client_name || job.title}</span>
                    <span className="text-xs text-muted-foreground">{job.branch} · {job.client_address}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
