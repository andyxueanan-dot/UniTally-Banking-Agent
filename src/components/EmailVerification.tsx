import { useState, useEffect, useCallback } from 'react';
import { Mail, Send, RefreshCw } from 'lucide-react';
import { sendVerificationCodeFirebase, verifyCodeFirebase } from '@/lib/firebase';

const CODE_LENGTH = 6;
const MAX_SEND_COUNT = 5;
const LOCK_TIME = 60 * 60;
const RESEND_INTERVAL = 60;

interface EmailVerificationProps {
  email: string;
  onVerify: (isValid: boolean) => void;
  language: 'zh' | 'en';
  useFirebase?: boolean;
}

export default function EmailVerification({ email, onVerify, language, useFirebase = false }: EmailVerificationProps) {
  const [userCode, setUserCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sendCount, setSendCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockEndTime, setLockEndTime] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const sendVerificationCode = useCallback(async () => {
    if (!isValidEmail(email)) {
      setMessage({
        type: 'error',
        text: language === 'zh' ? '请输入有效的邮箱地址' : 'Please enter a valid email address'
      });
      return;
    }

    if (isLocked) {
      const remaining = Math.ceil((lockEndTime - Date.now()) / 1000);
      setMessage({
        type: 'error',
        text: language === 'zh' 
          ? `操作过于频繁，请等待 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒` 
          : `Too many requests, please wait ${Math.floor(remaining / 60)}m ${remaining % 60}s`
      });
      return;
    }

    if (sendCount >= MAX_SEND_COUNT) {
      setIsLocked(true);
      setLockEndTime(Date.now() + LOCK_TIME * 1000);
      setMessage({
        type: 'error',
        text: language === 'zh' 
          ? '发送次数已达上限，请1小时后再试' 
          : 'Maximum attempts reached, please try again in 1 hour'
      });
      return;
    }

    setIsSending(true);
    setMessage(null);

    try {
      if (useFirebase) {
        const result = await sendVerificationCodeFirebase(email);
        setMessage({
          type: 'success',
          text: language === 'zh' 
            ? `验证码已发送至 ${email}` 
            : `Verification code sent to ${email}`
        });
      } else {
        const response = await fetch('http://localhost:5000/api/auth/send-verification-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to send code');
        }

        let successText = language === 'zh' 
          ? `验证码已发送至 ${email}` 
          : `Verification code sent to ${email}`;
        
        if (data.devCode) {
          successText += ` (开发模式验证码: ${data.devCode})`;
        }
        
        setMessage({
          type: 'success',
          text: successText
        });
      }

      setCountdown(RESEND_INTERVAL);
      setSendCount(prev => prev + 1);
      setUserCode('');
      setIsVerified(false);
      onVerify(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : (language === 'zh' ? '发送失败，请重试' : 'Failed to send, please try again');
      setMessage({
        type: 'error',
        text: errorMessage
      });
    } finally {
      setIsSending(false);
    }
  }, [email, isLocked, lockEndTime, sendCount, language, onVerify, useFirebase]);

  const verifyCode = useCallback(async (code: string) => {
    if (code.length !== CODE_LENGTH) {
      setIsVerified(false);
      onVerify(false);
      return;
    }

    try {
      if (useFirebase) {
        const result = await verifyCodeFirebase(email, code);
        if (result.success) {
          setIsVerified(true);
          onVerify(true);
          setMessage({
            type: 'success',
            text: language === 'zh' ? '✓ 邮箱验证成功' : '✓ Email verified successfully'
          });
        }
      } else {
        const response = await fetch('http://localhost:5000/api/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setIsVerified(true);
          onVerify(true);
          setMessage({
            type: 'success',
            text: language === 'zh' ? '✓ 邮箱验证成功' : '✓ Email verified successfully'
          });
        } else {
          setIsVerified(false);
          onVerify(false);
          setMessage({
            type: 'error',
            text: data.error || (language === 'zh' ? '验证码不正确' : 'Invalid verification code')
          });
        }
      }
    } catch {
      setIsVerified(false);
      onVerify(false);
      setMessage({
        type: 'error',
        text: language === 'zh' ? '验证失败，请重试' : 'Verification failed, please try again'
      });
    }
  }, [email, language, onVerify, useFirebase]);

  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (!isLocked) return;

    const timer = setInterval(() => {
      if (Date.now() >= lockEndTime) {
        setIsLocked(false);
        setLockEndTime(0);
        setSendCount(0);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isLocked, lockEndTime]);

  useEffect(() => {
    if (userCode.length === CODE_LENGTH && !isVerified) {
      verifyCode(userCode);
    }
  }, [userCode, isVerified, verifyCode]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const canResend = countdown === 0 && !isLocked && sendCount < MAX_SEND_COUNT;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Mail className="w-4 h-4" />
        <span>{language === 'zh' ? '我们将向您的邮箱发送验证码' : 'We will send a verification code to your email'}</span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={sendVerificationCode}
          disabled={!email || isSending || !canResend}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            !email || isSending || !canResend
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:opacity-90'
          }`}
        >
          {isSending ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              {language === 'zh' ? '发送中...' : 'Sending...'}
            </>
          ) : countdown > 0 ? (
            <>
              <Send className="w-4 h-4" />
              {language === 'zh' ? `重新发送 (${countdown}s)` : `Resend (${countdown}s)`}
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              {language === 'zh' ? '发送验证码' : 'Send Code'}
            </>
          )}
        </button>
      </div>

      {message && (
        <div className={`text-sm ${message.type === 'success' ? 'text-income' : message.type === 'error' ? 'text-expense' : 'text-muted-foreground'}`}>
          {message.text}
        </div>
      )}

      {sendCount > 0 && !isVerified && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {language === 'zh' ? '验证码有效期: 10分钟' : 'Code valid for: 10 minutes'}
            </span>
            <span>
              {language === 'zh' 
                ? `剩余发送次数: ${MAX_SEND_COUNT - sendCount}/${MAX_SEND_COUNT}` 
                : `Remaining sends: ${MAX_SEND_COUNT - sendCount}/${MAX_SEND_COUNT}`}
            </span>
          </div>

          <div className="space-y-1">
            <input
              type="text"
              value={userCode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
                setUserCode(value);
                if (value.length < CODE_LENGTH) {
                  setIsVerified(false);
                  onVerify(false);
                  setMessage(null);
                }
              }}
              placeholder={language === 'zh' ? '请输入6位验证码' : 'Enter 6-digit code'}
              maxLength={CODE_LENGTH}
              disabled={isVerified}
              className={`w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground text-center tracking-[0.5em] font-mono text-lg ${
                isVerified ? 'border-2 border-income' : ''
              }`}
            />
          </div>
        </div>
      )}

      {isLocked && (
        <div className="text-xs text-expense">
          {language === 'zh' 
            ? `发送次数已达上限，请等待 ${formatTime(Math.ceil((lockEndTime - Date.now()) / 1000))} 后重试` 
            : `Maximum attempts reached, please wait ${formatTime(Math.ceil((lockEndTime - Date.now()) / 1000))}`}
        </div>
      )}
    </div>
  );
}
