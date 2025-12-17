import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Mail, CheckCircle } from 'lucide-react';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.forgotPassword(email);
      setEmailSent(true);
      toast.success('Email enviado com sucesso!');
    } catch (error) {
      toast.error('Erro ao enviar email. Tente novamente.');
    } finally {
      setLoading(false);
    }
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
          </div>

          {emailSent ? (
            // Success State
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold text-white">Email Enviado!</h2>
              <p className="text-muted-foreground text-sm">
                Se o email <span className="text-white font-medium">{email}</span> estiver cadastrado, 
                você receberá um link para redefinir sua senha.
              </p>
              <p className="text-muted-foreground text-xs">
                Verifique também sua pasta de spam.
              </p>
              <Link to="/login">
                <Button
                  variant="outline"
                  className="w-full mt-4 border-white/20 text-white hover:bg-white/10"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar para Login
                </Button>
              </Link>
            </div>
          ) : (
            // Form State
            <>
              <div className="text-center mb-6">
                <div className="w-12 h-12 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-4">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-white">Esqueceu sua senha?</h2>
                <p className="text-muted-foreground text-sm mt-2">
                  Digite seu email e enviaremos um link para redefinir sua senha.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-primary focus:ring-primary/20"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full h-12 bg-primary text-white hover:bg-primary/90 shadow-[0_0_15px_rgba(255,31,90,0.3)] transition-all duration-300 font-semibold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar Link de Recuperação'
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link 
                  to="/login" 
                  className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
