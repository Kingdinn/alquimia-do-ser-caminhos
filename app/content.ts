export const steps = [
{title:"A vida é sonho",short:"Sonhar",subtitle:"Antes dos planos, dê espaço ao que deseja viver.",question:"Se não houvesse limites, como seria a sua vida?",hint:"Escreva livremente sobre criação, trabalho, relações, corpo e o lugar onde deseja viver. Você pode mudar de ideia."},
{title:"Meu vision board",short:"Visualizar",subtitle:"Dê forma ao que faz seus olhos brilharem.",question:"Que imagens representam a vida que deseja cultivar?",hint:"Escolha imagens pelo significado que têm para você. Acrescente uma intenção a cada uma."},
{title:"O caminho do mago",short:"Ser",subtitle:"Sua nova identidade começa em pequenos gestos.",question:"Quem você escolhe se tornar para viver esse sonho?",hint:"Escreva como uma história simbólica. Depois, traduza suas virtudes em atitudes observáveis."},
{title:"Minha visão de um ano",short:"Envisionar",subtitle:"Um horizonte com espaço para a vida acontecer.",question:"Daqui a um ano, o que quero estar vivendo?",hint:"Descreva resultados desejados e como quer se sentir. Diferencie suas ações das oportunidades que dependem de outras pessoas."},
{title:"Do sonho à estratégia",short:"Planejar",subtitle:"Transforme seus desejos em metas que você consegue acompanhar.",question:"O que quero conquistar e como vou reconhecer meu avanço?",hint:"Escolha uma meta por vez. Defina o resultado, seu ponto de partida e o próximo passo. No passo 6, reserve os dias e horários da prática."},
{title:"Meu calendário",short:"Praticar",subtitle:"Seu mês por inteiro. Um dia de cada vez.",question:"Onde minhas metas encontram espaço no calendário?",hint:"Veja suas metas, agende atividades e acompanhe as datas de revisão. Inclua criação, sustento, cuidado e descanso."},
{title:"Perceber meu progresso",short:"Acompanhar",subtitle:"Observe o caminho com curiosidade, sem se julgar.",question:"O que avançou e o que precisa de cuidado?",hint:"Compare-se com seu próprio ponto de partida. Uma semana difícil também traz informação. Ajuste o plano em vez de desistir dele."}
];
export type Goal={id:string;area:string;baseline:string;three:string;six:string;metric:string;current:string;target:string;date:string;next:string;title?:string;tracking?:"count"|"checklist"|"monthly"|"habit";habit?:{period:"daily"|"weekly";times:string;duration:string;durationMax?:string};milestones?:{id:string;title:string;done:boolean}[];monthlyProgress?:{month:string;current:string}[]};
export type Block={id:string;day:string;time:string;duration:string;activity:string;goalId?:string;date?:string;startsOn?:string;endsOn?:string};
export type BoardImage={id:string;caption:string};
export type Checkin={date:string;action:string;energy:string;learned:string;next:string};
export type Journal={texts:string[];goals:Goal[];blocks:Block[];images:BoardImage[];checkins:Checkin[];checkinDraft?:Checkin};
export const emptyJournal=():Journal=>({texts:Array(7).fill(""),goals:[],blocks:[],images:[],checkins:[]});
