import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import EmailVerification from '@/components/EmailVerification';

const Login = () => {
  const { login, loginWithGoogle, register, authLoading, t, language } = useApp();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (isRegistering && !emailVerified) {
      setError(language === 'zh' ? '请先完成邮箱验证' : 'Please complete email verification first');
      return;
    }
    
    try {
      if (isRegistering) {
        await register(email, password, name);
        toast.success(t.auth.registerSuccess);
      } else {
        await login(email, password);
        toast.success(t.auth.loginSuccess);
      }
      navigate('/transactions');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');
    
    try {
      await loginWithGoogle();
      toast.success(t.auth.loginSuccess);
      navigate('/transactions');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Google login failed';
      setError(errorMessage);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md glass-card">
        <CardHeader>
          <CardTitle className="text-foreground">{isRegistering ? t.auth.register : t.auth.login}</CardTitle>
          <CardDescription className="text-muted-foreground">
            {isRegistering 
              ? (language === 'zh' ? '输入您的信息创建新账户' : 'Enter your info to create an account')
              : 'Enter your email and password to sign in'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>{language === 'zh' ? '错误' : 'Error'}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            {isRegistering && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">{t.auth.name}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={language === 'zh' ? '您的名字' : 'Your name'}
                  required
                  className="bg-secondary text-foreground"
                  autoComplete="off"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">{t.auth.email}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (isRegistering) {
                    setEmailVerified(false);
                  }
                }}
                placeholder="your.email@example.com"
                required
                className="bg-secondary text-foreground"
                autoComplete="off"
              />
            </div>
            
            {isRegistering && (
              <div className="space-y-2">
                <Label className="text-foreground">
                  {language === 'zh' ? '邮箱验证' : 'Email Verification'}
                </Label>
                <EmailVerification 
                  email={email}
                  onVerify={setEmailVerified} 
                  language={language} 
                />
              </div>
            )}
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="text-foreground">{t.auth.password}</Label>
                {!isRegistering && (
                  <button 
                    type="button"
                    onClick={() => navigate('/forgot-password')} 
                    className="text-sm text-primary hover:underline"
                  >
                    {t.auth.forgotPassword}
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-secondary text-foreground"
                autoComplete="new-password"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full gradient-primary text-primary-foreground" 
              disabled={authLoading || (isRegistering && !emailVerified)}
            >
              {authLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isRegistering 
                    ? (language === 'zh' ? '创建账户中...' : 'Creating account...') 
                    : (language === 'zh' ? '登录中...' : 'Signing in...')}
                </>
              ) : (
                isRegistering ? t.auth.register : t.auth.login
              )}
            </Button>
          </form>
          
          <Separator className="my-6" />
          
          <Button
            variant="secondary"
            className="w-full bg-secondary text-foreground hover:bg-muted"
            onClick={handleGoogleLogin}
            disabled={authLoading || googleLoading}
          >
            {(authLoading || googleLoading) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {language === 'zh' ? 'Google登录中...' : 'Signing in with Google...'}
              </>
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {t.auth.loginWithGoogle}
              </>
            )}
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col justify-center gap-3">
          <p className="text-sm text-muted-foreground">
            {isRegistering ? (
              <>
                {t.auth.hasAccount}{' '}
                <button 
                  type="button"
                  onClick={() => {
                    setIsRegistering(false);
                    setEmailVerified(false);
                  }} 
                  className="text-primary hover:underline"
                >
                  {t.auth.login}
                </button>
              </>
            ) : (
              <>
                {t.auth.noAccount}{' '}
                <button 
                  type="button"
                  onClick={() => setIsRegistering(true)} 
                  className="text-primary hover:underline"
                >
                  {t.auth.register}
                </button>
              </>
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full border-primary/30 text-primary"
            onClick={() => navigate('/tuition-sandbox')}
          >
            {language === 'zh' ? '打开跨境学费沙箱演示' : 'Open cross-border tuition sandbox'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Login;
