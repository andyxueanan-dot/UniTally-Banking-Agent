import { useState } from 'react';
import type { BankBusiness } from '@/lib/bankApi';
import type { ManualAction } from './BankServices';
export default function RiskQuestionnaire({ data, profile, busy, onPrepare }: { data: BankBusiness['questionnaire']; profile: BankBusiness['riskProfile']; busy: boolean; onPrepare: (action: ManualAction) => void }) {
  const [answers,setAnswers] = useState<(string | null)[]>(() => data.questions.map(() => null));
  const [step,setStep] = useState(0);
  const [started,setStarted] = useState(!profile?.current);
  const ready = answers.length === data.questions.length && answers.every(Boolean);
  const question = data.questions[step];
  return <section className="ba-panel ba-risk-assessment" aria-label="模拟风险测评">
    <div className="ba-panel-heading"><h2>先了解你，再选择产品</h2><span>11题 · 本人作答</span></div>
    <p className="ba-service-intro">参考苏州银行 {data.source.version} 公开问卷，题干采用精简表述。请使用虚构信息作答，不是该行正式评估或投资建议；不填写真实财产、姓名或身份证号。</p>
    <a className="ba-link-button" href={data.source.url} target="_blank" rel="noreferrer">查看完整原题与来源</a>
    {profile && <div className="ba-risk-result" role="status"><strong>{profile.riskLabel}</strong><p>{profile.current ? `有效至 ${new Date(profile.expiresAt!).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})}` : profile.reason === 'LEGACY_VERSION' ? '旧版记录已保留，请完成新版测评后再申购。' : '测评已过期，请重新完成。'}</p>{profile.current && !profile.acceptsLoss && <p>你的关键回答体现不希望本金损失。即使总分较高，FinPilot仍拦截当前非保本模拟产品；这不会改变问卷的原始等级。</p>}{profile.current && profile.noInvestmentExperience && <p>原问卷投资经验部分存在A项回答，标记为无投资经验，请谨慎理解产品风险。</p>}</div>}
    {!started ? <button className="ba-secondary" disabled={busy} onClick={() => setStarted(true)}>重新进行模拟测评</button> : <div className="ba-risk-wizard">
      <div className="ba-risk-progress"><span>{step < data.questions.length ? `${step+1} / ${data.questions.length} · ${question.section}` : '核对你的答案'}</span><progress value={answers.filter(Boolean).length} max={data.questions.length} aria-label="问卷完成进度"/></div>
      {question ? <fieldset disabled={busy}><legend>{question.prompt}</legend>{question.note && <p className="ba-service-caption">{question.note}</p>}{question.options.map(option => <label key={option.value} className={answers[step] === option.value ? 'selected' : ''}><input type="radio" name={question.id} value={option.value} checked={answers[step] === option.value} onChange={() => setAnswers(current => current.map((a,i) => i === step ? option.value : a))}/><span>{option.label}</span></label>)}</fieldset> : <ol className="ba-risk-review">{data.questions.map((q,i) => <li key={q.id}><strong>{q.prompt}</strong><span>{q.options.find(o => o.value === answers[i])?.label || '未作答'}</span><button className="ba-link-button" onClick={() => setStep(i)}>修改第{i+1}题</button></li>)}</ol>}
      <div className="ba-risk-nav"><button className="ba-secondary" disabled={busy || step === 0} onClick={() => setStep(s => s-1)}>上一题</button>{question ? <button className="ba-primary" disabled={busy || !answers[step]} onClick={() => setStep(s => s+1)}>{step === data.questions.length-1 ? '核对答案' : '下一题'}</button> : <button className="ba-primary" disabled={busy || !ready} onClick={() => onPrepare({type:'risk_assessment',questionnaireVersion:data.version,answers})}>准备提交问卷</button>}</div>
      <p className="ba-service-caption">不展示单项分值，不默认选答案。提交后还需在待办中明确确认，才保存测评结果。</p>
    </div>}
  </section>;
}
