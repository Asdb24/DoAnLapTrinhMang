import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({exchange:vi.fn(),verify:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({serverClient:mocks.client}));
import { GET } from '@/app/auth/callback/route';
beforeEach(()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_APP_URL','https://app.example.test');
  vi.stubEnv('CHATFLOW_RUNTIME','electron');vi.stubEnv('CHATFLOW_DESKTOP_ORIGIN','http://127.0.0.1:3100');
  mocks.exchange.mockReset().mockResolvedValue({error:null});mocks.verify.mockReset().mockResolvedValue({error:null});
  mocks.client.mockReset().mockResolvedValue({auth:{exchangeCodeForSession:mocks.exchange,verifyOtp:mocks.verify}});
});
afterEach(()=>vi.unstubAllEnvs());
it('keeps desktop confirmation/recovery cookies on the trusted loopback origin after NextURL normalization',async()=>{
  for(const [query,target] of [['code=fixture','/'],['token_hash=fixture&type=recovery','/reset-password']]){
    const response=await GET(new Request(`http://localhost:3100/auth/callback?${query}`,{headers:{Host:'127.0.0.1:3100'}}));
    expect(response.status).toBe(307);expect(response.headers.get('location')).toBe(`http://127.0.0.1:3100${target}`);
  }
});
it('rejects foreign/forged callback listeners before exchanging tokens',async()=>{
  for(const [origin,host] of [['http://localhost:3100','attacker.test'],['http://localhost:3101','127.0.0.1:3100'],['https://attacker.test','attacker.test']]){
    expect((await GET(new Request(`${origin}/auth/callback?code=fixture`,{headers:{Host:host}}))).status).toBe(403);
  }
  expect(mocks.client).not.toHaveBeenCalled();
});
it('keeps hosted callback redirects canonical and desktop auth failures local',async()=>{
  mocks.exchange.mockResolvedValue({error:new Error('invalid token')});
  const request=new Request('http://127.0.0.1:3100/auth/callback?code=fixture');
  expect((await GET(request)).headers.get('location')).toBe('http://127.0.0.1:3100/?auth_error=confirmation');
  vi.stubEnv('CHATFLOW_RUNTIME','');mocks.exchange.mockResolvedValue({error:null});
  expect((await GET(request)).headers.get('location')).toBe('https://app.example.test/');
});
