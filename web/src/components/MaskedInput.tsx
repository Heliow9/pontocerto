import type {InputHTMLAttributes} from "react";
import {applyMask,maskMaxLength,type MaskKind} from "../utils/masks";

type Props=Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange"|"maxLength">&{
  mask:MaskKind;
  value:string|null|undefined;
  onChange:(value:string)=>void;
};

export function MaskedInput({mask,value,onChange,inputMode="numeric",...props}:Props){
  return <input {...props} inputMode={inputMode} maxLength={maskMaxLength(mask)} value={applyMask(mask,value??"")} onChange={e=>onChange(applyMask(mask,e.target.value))}/>;
}
