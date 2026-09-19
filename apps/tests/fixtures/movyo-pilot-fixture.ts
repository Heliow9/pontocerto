import {addOneCalendarMonthDate} from '../../api/src/services/product-subscription-core.js';
import {mapSubscriptionOperationalState} from '../../api/src/services/product-integration-core.js';

type MappingStatus='LEGACY_MOVYO'|'READY_TO_MIGRATE'|'PONTO_CERTO';
type Subscription={id:number;billingSource:'MOVYO_LEGACY'|'PONTO_CERTO';status:string;currentPeriodEnd:string;nextDueDate:string};
type Charge={id:number;competence:string;status:'OPEN'|'PAID';providerPaymentId?:string};

export class MovyoPilotFixture{
  mapping:{status:MappingStatus;externalId:string}|null=null;
  subscriptions:Subscription[]=[];
  charges:Charge[]=[];
  payments:{providerPaymentId:string;chargeId:number}[]=[];
  processedWebhooks=new Set<string>();
  bridgeState={billingSource:'MOVYO_LEGACY',billingStatus:'ACTIVE',billingAccessBlocked:false,currentPeriodEnd:'2026-10-15'};
  syncWrites=0;

  syncDirectory(externalId='movyo-101'){
    if(!this.mapping)this.mapping={status:'LEGACY_MOVYO',externalId};
    return this.mapping;
  }

  importCustomer(){
    if(!this.mapping)this.syncDirectory();
    if(!this.subscriptions.length)this.subscriptions.push({id:1,billingSource:'MOVYO_LEGACY',status:'ACTIVE',currentPeriodEnd:'2026-10-15',nextDueDate:'2026-10-15'});
    this.mapping!.status='READY_TO_MIGRATE';
    return this.subscriptions[0];
  }

  cutover(){
    const subscription=this.subscriptions[0]??this.importCustomer();
    if(this.mapping!.status==='PONTO_CERTO')return subscription;
    subscription.billingSource='PONTO_CERTO';
    this.mapping!.status='PONTO_CERTO';
    this.pushState();
    return subscription;
  }

  issueMonthly(competence:string){
    const existing=this.charges.find(x=>x.competence===competence);
    if(existing)return existing;
    const charge:Charge={id:this.charges.length+1,competence,status:'OPEN'};
    this.charges.push(charge);
    return charge;
  }

  providerPaid(webhookId:string,providerPaymentId:string,competence:string){
    if(this.processedWebhooks.has(webhookId))return{duplicate:true};
    this.processedWebhooks.add(webhookId);
    const charge=this.issueMonthly(competence);
    if(charge.status!=='PAID'){
      charge.status='PAID';
      charge.providerPaymentId=providerPaymentId;
      if(!this.payments.some(x=>x.providerPaymentId===providerPaymentId))this.payments.push({providerPaymentId,chargeId:charge.id});
      const subscription=this.subscriptions[0];
      const next=addOneCalendarMonthDate(subscription.currentPeriodEnd);
      subscription.currentPeriodEnd=next;
      subscription.nextDueDate=next;
      subscription.status='ACTIVE';
      this.pushState();
    }
    return{duplicate:false};
  }

  block(){this.subscriptions[0].status='BLOCKED';this.pushState();}
  unblock(){this.subscriptions[0].status='ACTIVE';this.pushState();}

  reconcile(){
    const subscription=this.subscriptions[0];
    const state=mapSubscriptionOperationalState(subscription.status);
    const expected={billingSource:subscription.billingSource,billingStatus:state.billingStatus,billingAccessBlocked:state.billingAccessBlocked,currentPeriodEnd:subscription.currentPeriodEnd};
    const aligned=JSON.stringify(expected)===JSON.stringify(this.bridgeState);
    if(!aligned)this.pushState();
    return{aligned:aligned||JSON.stringify(expected)===JSON.stringify(this.bridgeState)};
  }

  private pushState(){
    const subscription=this.subscriptions[0];
    const state=mapSubscriptionOperationalState(subscription.status);
    const next={billingSource:subscription.billingSource,billingStatus:state.billingStatus,billingAccessBlocked:state.billingAccessBlocked,currentPeriodEnd:subscription.currentPeriodEnd};
    if(JSON.stringify(next)!==JSON.stringify(this.bridgeState)){this.bridgeState=next;this.syncWrites+=1;}
  }
}
