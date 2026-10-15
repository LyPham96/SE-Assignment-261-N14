import { useEffect, useState } from 'react';
import { User, Mail, ShieldCheck, Sun, Moon, Check, Languages } from 'lucide-react';
import { translate, useTranslation } from './translations';
import './preferences.css';
export type Theme='light'|'dark';
export type Language='vi'|'en';
function saved<T extends string>(key:string,allowed:readonly T[],fallback:T):T{try{const value=localStorage.getItem(key) as T;return allowed.includes(value)?value:fallback}catch{return fallback}}
export function usePreferences(){
 const [theme,setTheme]=useState<Theme>(()=>saved('pikepike-theme',['light','dark'],'light'));
 const [language,setLanguage]=useState<Language>(()=>saved('pikepike-language',['vi','en'],'vi'));
 useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;try{localStorage.setItem('pikepike-theme',theme)}catch{}},[theme]);
 useEffect(()=>{document.documentElement.lang=language;try{localStorage.setItem('pikepike-language',language)}catch{}},[language]);
 useTranslation(language);
 return {theme,setTheme,language,setLanguage};
}
export function Settings({theme,setTheme,language,setLanguage,role}:{theme:Theme;setTheme:(v:Theme)=>void;language:Language;setLanguage:(v:Language)=>void;role:string}){
 const t=(s:string)=>language==='en'?translate(s):s;
 const student=role==='Sinh viên';
 return <div className="settings-layout">
  <section className="profile-panel"><div className="profile-avatar"><User size={30}/></div><div><h2>{student?'Nguyễn Vũ Bách':'Minh An'}</h2><span className="badge">{t(role)}</span></div><ShieldCheck size={21} className="profile-verified"/></section>
  <div className="profile-details"><div><Mail size={16}/><span>{student?'bach.nguyen@hcmut.edu.vn':'minhan@pikepike.vn'}</span></div><div><ShieldCheck size={16}/><span>{t('Tài khoản đã xác thực')}</span></div></div>
  <section className="settings-section"><h2>{t('Giao diện')}</h2><p>{t('Áp dụng cho toàn bộ màn hình PikePike.')}</p><div className="theme-options" role="group" aria-label={t('Chế độ giao diện')}>
   {(['light','dark'] as const).map(value=><button key={value} className={'theme-option '+(theme===value?'selected':'')} onClick={()=>setTheme(value)} aria-pressed={theme===value}><div className={'theme-thumbnail '+value}><div/><span/><span/><i/><b/></div><span className="theme-label">{value==='light'?<Sun size={17}/>:<Moon size={17}/>} {t(value==='light'?'Sáng':'Tối')}{theme===value&&<Check size={16}/>}</span></button>)}
  </div></section>
  <section className="settings-section"><div className="settings-section-heading"><Languages size={20}/><h2>{t('Ngôn ngữ')}</h2></div><div className="language-options" role="group" aria-label={t('Ngôn ngữ')}>
   <button aria-pressed={language==='vi'} className={language==='vi'?'selected':''} onClick={()=>setLanguage('vi')}><span className="language-code">VI</span><span>Tiếng Việt<small>Vietnamese</small></span>{language==='vi'&&<Check size={18}/>}</button>
   <button aria-pressed={language==='en'} className={language==='en'?'selected':''} onClick={()=>setLanguage('en')}><span className="language-code">EN</span><span>English<small>Tiếng Anh</small></span>{language==='en'&&<Check size={18}/>}</button>
  </div></section>
  <p className="preferences-saved"><Check size={14}/>{t('Tùy chọn được lưu tự động trên thiết bị này.')}</p>
 </div>
}
