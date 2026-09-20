export function deepSnapshot<T>(value:T):T{return value==null?value:JSON.parse(JSON.stringify(value));}
export type CommercialDocumentSnapshots={seller:any;customer:any;product:any;plan:any;pricing:any;billing:any};
export function buildCommercialDocumentSnapshots(input:CommercialDocumentSnapshots){return{seller:deepSnapshot(input.seller),customer:deepSnapshot(input.customer),product:deepSnapshot(input.product),plan:deepSnapshot(input.plan),pricing:deepSnapshot(input.pricing),billing:deepSnapshot(input.billing)};}
