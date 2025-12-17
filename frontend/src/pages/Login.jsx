import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      toast.success('Login realizado com sucesso!');
      navigate('/dashboard');
    } else {
      toast.error(result.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-10" 
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1729944950511-e9c71556cfd4?crop=entropy&cs=srgb&fm=jpg&q=85)' }}
      />
      
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-8 backdrop-blur-xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-4xl font-heading font-bold text-white tracking-tight">
              INDÚSTRIA
            </h1>
            <span className="text-2xl font-heading text-primary">VISUAL</span>
            <p className="text-sm text-muted-foreground mt-2">Transformamos ideias em realidade</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="email-input"
                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-primary focus:ring-primary/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="password-input"
                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-primary focus:ring-primary/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              data-testid="login-button"
              className="w-full h-12 bg-primary text-white hover:bg-primary/90 shadow-[0_0_15px_rgba(255,31,90,0.3)] transition-all duration-300 font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>© 2025 INDÚSTRIA VISUAL</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;