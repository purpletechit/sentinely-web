import { handleForm, type Env } from '../_shared/form';

// /api/affiliate — affiliate programme applications. POST only; other methods → 405.
export const onRequest: PagesFunction<Env> = ({ request, env }) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  }
  return handleForm(request, env, 'affiliate');
};
