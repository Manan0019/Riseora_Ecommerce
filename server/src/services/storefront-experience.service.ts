import { z } from "zod";

// No HTML, scripts, embeds, user CSS, CSS selectors, custom attributes or arbitrary protocols.
// All copy is rendered by React as escaped text.
const content = (max: number) => z.string().trim().max(max).default("");
const safeLink = z.string().trim().max(500).refine(value =>
  !value || ((value.startsWith("/") && !value.startsWith("//") && !/[<>\\]/.test(value)) || /^https:\/\/[a-z\d.-]+(?::443)?(?:\/[\w%./?=&+~#-]*)?$/i.test(value)),
  "Links must be an internal path or HTTPS URL"
).default("");
const safeImage = z.string().trim().max(1000).refine(value => !value ||
 (value.startsWith("/uploads/") && !/[<>\\]/.test(value)) || /^https:\/\/[\w.-]+(?::443)?\/[\w%./?=&+~#-]+$/i.test(value),
 "Media must be an approved /uploads/ path or HTTPS URL"
).default("");
const itemSchema = z.object({
  id: z.string().max(80).regex(/^[a-zA-Z0-9_-]+$/),
  title: content(100), body: content(700), image: safeImage,
  label: content(70), href: safeLink, badge: content(40),
}).strict();
const sectionType = z.enum(["hero","split","collections","features","story","productShelf","testimonials","faq","marquee","newsletter","gallery","countdown"]);
export const phase98SectionSchema = z.object({
  id: z.string().min(3).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  type: sectionType,
  enabled: z.boolean().default(true),
  eyebrow: content(70), heading: content(180), subheading: content(600),
  image: safeImage, imageAlt: content(200),
  mobileImage: safeImage, ctaText: content(60), ctaHref: safeLink,
  secondaryCtaText: content(60), secondaryCtaHref: safeLink,
  align: z.enum(["left","center","right"]).default("left"),
  style: z.enum(["light","dark","accent","image"]).default("light"),
  height: z.enum(["compact","regular","tall"]).default("regular"),
  animation: z.enum(["none","fade","rise","zoom","slide"]).default("rise"),
  items: z.array(itemSchema).max(18).default([]),
  // The countdown is a visual merchandising hint only, never an unconditional checkout promotion.
  endAt: z.string().datetime({offset: true}).nullable().default(null),
  productIds: z.array(z.string().uuid()).max(16).default([]),
}).strict();
export const phase98DocumentSchema = z.object({
  version: z.literal(1),
  brand: z.object({
    accent: z.enum(["sage","gold","terracotta","rose","midnight"]).default("sage"),
    typography: z.enum(["editorial","modern","classic"]).default("editorial"),
    radius: z.enum(["soft","rounded","sharp"]).default("soft"),
    motion: z.enum(["subtle","immersive","off"]).default("subtle"),
    density: z.enum(["airy","balanced","compact"]).default("airy"),
  }).strict(),
  announcement: z.object({enabled:z.boolean(),text:content(160),href:safeLink}).strict(),
  seo: z.object({title:content(120),description:content(320)}).strict(),
  sections: z.array(phase98SectionSchema).min(1).max(35),
}).strict().superRefine((value, ctx) => {
 const ids = new Set<string>();
 for (let i = 0; i < value.sections.length; i++) {
  const section = value.sections[i];
  if (ids.has(section.id)) ctx.addIssue({code:"custom",path:["sections",i,"id"],message:"Duplicate section ID"});
  ids.add(section.id);
  if (section.type === "countdown" && section.enabled && !section.endAt) ctx.addIssue({code:"custom",path:["sections",i,"endAt"],message:"Enabled countdown needs an end date"});
  const itemIds = new Set<string>();
  section.items.forEach((item,j) => {if (itemIds.has(item.id)) ctx.addIssue({code:"custom",path:["sections",i,"items",j,"id"],message:"Duplicate item ID"});itemIds.add(item.id);});
 }
});
export type Phase98Document = z.infer<typeof phase98DocumentSchema>;
export const PHASE98_DEFAULT_DOCUMENT: Phase98Document = {
 version: 1,
 brand: {accent:"sage",typography:"editorial",radius:"soft",motion:"subtle",density:"airy"},
 announcement: {enabled:true,text:"Nature-led care, thoughtfully made.",href:"/shop"},
 seo: {title:"Riseora Herbals | Rituals Rooted in Nature",description:"Explore thoughtful herbal rituals for skin, hair and everyday care."},
 sections: [
  {id:"hero-signature",type:"hero",enabled:true,eyebrow:"RISEORA HERBALS · EVERYDAY RITUALS",heading:"A little closer to nature.",subheading:"Botanical care for the rituals that make you feel like yourself.",image:"",mobileImage:"",imageAlt:"",ctaText:"Explore the collection",ctaHref:"/shop",secondaryCtaText:"Our story",secondaryCtaHref:"/about",align:"left",style:"accent",height:"tall",animation:"rise",items:[],endAt:null,productIds:[]},
  {id:"ritual-benefits",type:"features",enabled:true,eyebrow:"THE RISEORA WAY",heading:"Good care feels effortless.",subheading:"A calmer approach to everyday beauty.",image:"",mobileImage:"",imageAlt:"",ctaText:"",ctaHref:"",secondaryCtaText:"",secondaryCtaHref:"",align:"center",style:"light",height:"regular",animation:"fade",items:[
   {id:"f1",title:"Botanical focus",body:"Thoughtfully considered ingredients.",image:"",label:"01",href:"",badge:""},
   {id:"f2",title:"Everyday ritual",body:"Easy to make part of your routine.",image:"",label:"02",href:"",badge:""},
   {id:"f3",title:"Made with intention",body:"Care you can come back to.",image:"",label:"03",href:"",badge:""}],endAt:null,productIds:[]},
  {id:"our-story",type:"split",enabled:true,eyebrow:"OUR PHILOSOPHY",heading:"A slower, softer kind of self-care.",subheading:"A beautiful daily moment, made yours. From first use to everyday favourite.",image:"",mobileImage:"",imageAlt:"Botanical self-care",ctaText:"Discover Riseora",ctaHref:"/about",secondaryCtaText:"",secondaryCtaHref:"",align:"left",style:"dark",height:"regular",animation:"slide",items:[],endAt:null,productIds:[]},
  {id:"shop-callout",type:"collections",enabled:true,eyebrow:"EXPLORE",heading:"Your next favourite ritual.",subheading:"Find a routine worth looking forward to.",image:"",mobileImage:"",imageAlt:"",ctaText:"Shop all",ctaHref:"/shop",secondaryCtaText:"",secondaryCtaHref:"",align:"left",style:"light",height:"regular",animation:"zoom",items:[],endAt:null,productIds:[]}
 ]
};

export function phase98ValidateDocument(input: unknown) {return phase98DocumentSchema.safeParse(input);}
export function phase98VisibleDocument(input: unknown) {
 const checked = phase98ValidateDocument(input);
 if (!checked.success) return null;
 return {...checked.data,sections:checked.data.sections.filter(s=>s.enabled)};
}

// Both read paths are safe and expose no private draft to the storefront.
export async function phase98PublishedDocument(db: any) {
 const state = await db.storefrontExperience.findUnique({where:{id:"primary"},select:{published:true,publishedRevision:true,publishedAt:true}});
 return {revision:state?.publishedRevision||0,publishedAt:state?.publishedAt||null,document:phase98VisibleDocument(state?.published)};
}
export async function phase98EditableDocument(db: any) {
 const state = await db.storefrontExperience.findUnique({where:{id:"primary"}});
 return {draft:state?.draft??PHASE98_DEFAULT_DOCUMENT, revision:state?.revision??1, publishedRevision:state?.publishedRevision??0, publishedAt:state?.publishedAt??null};
}
