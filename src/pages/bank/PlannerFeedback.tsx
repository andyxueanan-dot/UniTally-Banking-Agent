import { useState } from 'react';
export default function PlannerFeedback({ busy, onSave }: { busy: boolean; onSave: (correction: string) => Promise<boolean> }) {
  const [correction, setCorrection] = useState('');
  const [saved, setSaved] = useState(false);
  return <details className="ba-planner-feedback"><summary>理解有误？记录纠正</summary><form onSubmit={async e => { e.preventDefault(); if (await onSave(correction)) { setSaved(true); setCorrection(''); } }}>
    <label>你实际想表达什么？<textarea aria-label="纠正说明" maxLength={1000} required value={correction} onChange={e => { setCorrection(e.target.value); setSaved(false); }} placeholder="只填虚构业务信息，不填账号或密钥。"/></label>
    <p>提交后相关未确认草案失效；仅进入待审核队列，不会执行新指令或自动训练模型。</p>
    <button type="submit" disabled={busy || !correction.trim()}>提交纠正</button>{saved && <span role="status">已记录，待审核。</span>}
  </form></details>;
}
