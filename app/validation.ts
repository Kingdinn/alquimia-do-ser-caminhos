import {z} from "zod";
const short=z.string().max(2000);const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);const id=z.string().uuid();
const monthlyCurrent=z.string().max(20).refine(value=>value===""||(/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value.trim())&&Number.isFinite(Number(value.trim().replace(",",".")))&&Number(value.trim().replace(",","."))>=0));
const positiveIntegerOrBlank=(max:number)=>z.string().max(20).refine(value=>value===""||(/^\d+$/.test(value)&&Number(value)>=1&&Number(value)<=max));
const habitSchema=z.object({period:z.enum(["daily","weekly"]),times:z.string().max(20),duration:positiveIntegerOrBlank(1440),durationMax:positiveIntegerOrBlank(1440).optional()}).refine(value=>value.period==="daily"||positiveIntegerOrBlank(7).safeParse(value.times).success,{message:"Escolha entre 1 e 7 dias por semana.",path:["times"]}).refine(value=>!value.duration||!value.durationMax||Number(value.durationMax)>=Number(value.duration),{message:"A duração máxima deve ser maior ou igual à mínima.",path:["durationMax"]});
const draftHabitSchema=z.object({period:z.enum(["daily","weekly"]),times:z.string().max(20),duration:z.string().max(20),durationMax:z.string().max(20).optional()});
const goalBaseSchema=z.object({
  id,area:short,baseline:short,three:short,six:short,metric:short,current:short,target:short,date:z.union([date,z.literal("")]),next:short,
  title:short.optional(),tracking:z.enum(["count","checklist","monthly","habit"]).optional(),habit:draftHabitSchema.optional(),
  milestones:z.array(z.object({id,title:short,done:z.boolean()})).max(30).refine(items=>new Set(items.map(item=>item.id)).size===items.length,{message:"Etapas devem ter identificadores únicos."}).optional(),
  monthlyProgress:z.array(z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),current:monthlyCurrent})).max(120).refine(items=>new Set(items.map(item=>item.month)).size===items.length,{message:"Cada mês deve ter um único registro."}).optional(),
});
// Keep inactive form data recoverable; only the currently visible habit form can block a cloud save.
const goalSchema=goalBaseSchema.superRefine((goal,context)=>{
  if(goal.tracking!=="habit"||!goal.habit)return;
  const result=habitSchema.safeParse(goal.habit);
  if(!result.success)for(const issue of result.error.issues)context.addIssue({...issue,path:["habit",...issue.path]});
});
const calendarDate=date.refine(value=>{
  const [year,month,day]=value.split("-").map(Number);
  const parsed=new Date(0);parsed.setUTCHours(0,0,0,0);parsed.setUTCFullYear(year,month-1,day);
  return year>=1&&parsed.getUTCFullYear()===year&&parsed.getUTCMonth()===month-1&&parsed.getUTCDate()===day;
},{message:"Escolha uma data válida."});
const blockBaseSchema=z.object({id,day:z.enum(["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"]),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),duration:z.string().refine(v=>Number(v)>0&&Number(v)<=1440),activity:short,goalId:id.optional(),date:calendarDate.optional(),startsOn:calendarDate.optional(),endsOn:calendarDate.optional()});
function validateBlockDates(block:z.infer<typeof blockBaseSchema>,context:z.RefinementCtx){
  if(block.date!==undefined&&(block.startsOn!==undefined||block.endsOn!==undefined))context.addIssue({code:z.ZodIssueCode.custom,path:["date"],message:"Escolha uma data única ou uma repetição semanal."});
  if(block.startsOn&&block.endsOn&&block.endsOn<block.startsOn)context.addIssue({code:z.ZodIssueCode.custom,path:["endsOn"],message:"A repetição deve terminar depois de começar."});
  if(!block.date&&block.startsOn&&block.endsOn&&calendarDate.safeParse(block.startsOn).success&&calendarDate.safeParse(block.endsOn).success){
    const [year,month,day]=block.startsOn.split("-").map(Number);const first=new Date(0);first.setUTCHours(0,0,0,0);first.setUTCFullYear(year,month-1,day);
    const target=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"].indexOf(block.day);first.setUTCDate(first.getUTCDate()+(target-first.getUTCDay()+7)%7);
    const [endYear,endMonth,endDay]=block.endsOn.split("-").map(Number);const last=new Date(0);last.setUTCHours(0,0,0,0);last.setUTCFullYear(endYear,endMonth-1,endDay);
    if(first.getTime()>last.getTime())context.addIssue({code:z.ZodIssueCode.custom,path:["endsOn"],message:"O dia escolhido não ocorre no intervalo de repetição."});
  }
  if(block.date&&calendarDate.safeParse(block.date).success){
    const [year,month,day]=block.date.split("-").map(Number);const parsed=new Date(0);parsed.setUTCHours(0,0,0,0);parsed.setUTCFullYear(year,month-1,day);
    if(block.day!==["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][parsed.getUTCDay()])context.addIssue({code:z.ZodIssueCode.custom,path:["day"],message:"O dia da semana deve corresponder à data."});
  }
}
const blockSchema=blockBaseSchema.superRefine(validateBlockDates);
export const journalSchema=z.object({texts:z.array(z.string().max(40000)).length(7),goals:z.array(goalSchema).max(30),blocks:z.array(blockSchema).max(150),images:z.array(z.object({id,caption:short})).max(12),checkins:z.array(z.object({date,action:short,energy:z.enum(["1","2","3","4","5"]),learned:short,next:short})).max(1500),checkinDraft:z.object({date:z.union([date,z.literal("")]),action:short,energy:z.enum(["1","2","3","4","5"]),learned:short,next:short}).optional()});
export const saveSchema=z.object({version:z.number().int().nonnegative(),data:journalSchema});

// Keep unfinished form inputs recoverable even before they satisfy cloud validation.
export const draftJournalSchema=journalSchema.extend({goals:z.array(goalBaseSchema).max(30),blocks:z.array(blockBaseSchema.extend({time:z.string().max(5),duration:z.string().max(20)}).superRefine(validateBlockDates)).max(150)});
