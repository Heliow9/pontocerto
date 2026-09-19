import type {InputHTMLAttributes} from "react";
import {formatCurrencyBRL,parseCurrencyDigits} from "../utils/masks";

type Props=Omit<InputHTMLAttributes<HTMLInputElement>,"type"|"value"|"onChange"|"min"|"max">&{
  value:number|null|undefined;
  onChange:(value:number|null)=>void;
  min?:number;
  max?:number;
};

export function CurrencyInput({value,onChange,min,max,inputMode="numeric",...props}:Props){
  const validate=(element:HTMLInputElement,next:number|null)=>{
    if(next!=null&&min!=null&&next<min)element.setCustomValidity(`O valor mínimo é ${formatCurrencyBRL(min)}.`);
    else if(next!=null&&max!=null&&next>max)element.setCustomValidity(`O valor máximo é ${formatCurrencyBRL(max)}.`);
    else element.setCustomValidity("");
  };
  return <input {...props} type="text" inputMode={inputMode} autoComplete="off" value={formatCurrencyBRL(value)} onChange={e=>{const next=parseCurrencyDigits(e.target.value);validate(e.target,next);onChange(next);}} onBlur={e=>validate(e.currentTarget,value??null)}/>;
}
