import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, X, ShieldCheck } from 'lucide-react';
import type { BankState } from '@/lib/bankApi';
import type { ManualAction } from '@/pages/bank/BankServices';

export default function MobileTransferSheet({ open, onOpenChange, state, busy, onPrepare }: {
  open: boolean; onOpenChange: (open: boolean) => void; state: BankState | null; busy: boolean;
  onPrepare: (action: ManualAction) => Promise<boolean | undefined>;
}) {
  const [recipient, setRecipient] = useState(''); const [amount, setAmount] = useState('');
  const [problem, setProblem] = useState(false);
  const valid = !!recipient && /^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(amount) && Number(amount) > 0 && Number(amount) <= 1000000;
  return <Dialog.Root open={open} onOpenChange={value=>{setProblem(false);onOpenChange(value);}}><Dialog.Portal><Dialog.Overlay className="ba-modal-overlay" /><Dialog.Content className="ba-modal bm-transfer-sheet"><Dialog.Close className="ba-modal-close" aria-label="关闭转账表单"><X size={20}/></Dialog.Close><Dialog.Title>转一笔钱</Dialog.Title><Dialog.Description>填写模拟转账信息。下一步只准备核对卡片，尚不扣款。</Dialog.Description><form onSubmit={async e=>{e.preventDefault();if(!valid||busy)return;setProblem(false);const ok=await onPrepare({type:'transfer',recipient,amount});if(ok)onOpenChange(false);else setProblem(true);}}><label>收款人<select aria-label="手机收款人" required value={recipient} disabled={busy} onChange={e=>setRecipient(e.target.value)}><option value="">请选择，不能猜测同名收款人</option>{state?.contacts.map(c=><option key={c.id} value={c.id}>{c.name} · 尾号 {c.last4}</option>)}</select></label><label>转账金额（人民币元）<input aria-label="手机转账金额" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)}/></label><p>当前可用余额：¥{((state?.available||0)/100).toFixed(2)}</p>{problem && <p role="alert">{state?.history[state.history.length-1]?.results?.find(r=>r.type==='blocked'||r.type==='clarify')?.text || '未能准备任务，请检查输入和页面上的后台提示；没有扣款。'}</p>}<div className="ba-guide-warning"><ShieldCheck size={17}/> 只使用虚构联系人和资金；服务端会检查余额和权限，再由你确认。</div><button type="submit" className="ba-primary" disabled={!valid||busy}>下一步：核对详情<ArrowRight size={17}/></button></form></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
