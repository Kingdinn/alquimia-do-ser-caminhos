import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:3217';
for(const [path,method,status] of [['/','GET',307],['/redefinir-senha','GET',307],['/api/journal','GET',401],['/api/journal','PUT',401],['/api/images','GET',401],['/api/images','POST',401],['/api/images/00000000-0000-0000-0000-000000000000','DELETE',401],['/api/images/00000000-0000-0000-0000-000000000000','GET',401]]){
 const res=await fetch(base+path,{method,redirect:'manual'});assert.equal(res.status,status,`${method} ${path}`);if(status===307)assert.ok(res.headers.get('location').endsWith('/entrar'));console.log(`PASS ${method} ${path}`)
}
const login=await fetch(base+'/entrar');assert.equal(login.status,200);const html=await login.text();assert.ok(html.includes('type="email"'));assert.ok(html.includes('type="password"'));assert.ok(!html.includes('Entrar com ChatGPT'));console.log('PASS independent login form');
const callback=await fetch(base+'/auth/callback?next=https://example.com',{redirect:'manual'});assert.ok(callback.headers.get('location').endsWith('/auth/erro'));console.log('PASS invalid auth callback');
