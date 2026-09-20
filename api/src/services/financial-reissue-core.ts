export type ChargeDiscountType='NONE'|'PERCENT'|'FIXED';

const money=(value:number)=>Math.round((Number(value)+Number.EPSILON)*100)/100;

export function calculateChargeAdjustment(baseAmount:number,discountType:ChargeDiscountType,discountValue:number){
  const base=money(baseAmount);
  if(!(base>0))throw new Error('Valor base da cobrança deve ser maior que zero.');
  const type=String(discountType||'NONE').toUpperCase() as ChargeDiscountType;
  const value=Number(discountValue||0);
  let discountAmount=0;
  if(type==='PERCENT'){
    if(!(value>0&&value<100))throw new Error('Desconto percentual deve ser maior que 0 e menor que 100.');
    discountAmount=money(base*(value/100));
  }else if(type==='FIXED'){
    if(!(value>0))throw new Error('Desconto em reais deve ser maior que zero.');
    discountAmount=money(value);
  }else if(type!=='NONE'){
    throw new Error('Tipo de desconto inválido.');
  }
  if(discountAmount>=base)throw new Error('O desconto deve manter a cobrança com valor positivo.');
  return{baseAmount:base,discountType:type,discountValue:type==='NONE'?0:value,discountAmount,newAmount:money(base-discountAmount)};
}
