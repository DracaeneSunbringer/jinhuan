const operationPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const creditIdPattern=/^[1-9]\d{0,19}$/

function cents(value){
 const text=String(value)
 if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(text))throw Error('LDC 金额最多两位小数')
 const [whole,fraction='']=text.split('.')
 return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))
}
function decimal(value){return `${value/100n}.${String(value%100n).padStart(2,'0')}`}

export function normalizeCreditCreate(input){
 if(input?.provider!=='credit' || !operationPattern.test(String(input.operation||'')) || !['fixed','random'].includes(input.kind))throw Error('Credit 创建参数无效')
 const amount=cents(input.amount),count=Number(input.count),greeting=String(input.greeting||'').trim()
 if(amount<100n || !Number.isSafeInteger(count) || count<1 || count>10000 || amount<BigInt(count))throw Error('总额至少 1 LDC，每份至少 0.01 LDC，份数为 1～10000')
 if([...greeting].length>100)throw Error('祝福语最多 100 字')
 return {operation:String(input.operation),kind:input.kind,amount:decimal(amount),count,greeting}
}

export function previewCreditCreate(params,config){
 if(config?.red_envelope_enabled!==true)throw Error('Credit 红包暂未开放或公开配置无法确认')
 const amount=cents(params.amount),rate=cents(config.red_envelope_fee_rate),max=cents(config.red_envelope_max_amount)
 const maxCount=Number(config.red_envelope_max_recipients)
 if(rate>100n || amount>max || !Number.isSafeInteger(maxCount) || params.count>maxCount)throw Error('超过 Credit 当前金额、份数或费率限制')
 const fee=(amount*rate+50n)/100n
 return {fee:decimal(fee),deduction:decimal(amount+fee)}
}

export function creditCreateId(raw){
 const id=raw?.data?.id
 if(raw?.success===false || typeof id!=='string' || !creditIdPattern.test(id))throw Error('Credit 创建结果无法确认，请核对已发送记录')
 return id
}
