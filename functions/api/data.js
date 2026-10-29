export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (key) {
    const row = await env.DB
      .prepare('SELECT data_value FROM workbench_data WHERE data_key = ?')
      .bind(key)
      .first();

    return Response.json({
      key,
      value: row?.data_value ?? null
    });
  }

  const result = await env.DB
    .prepare('SELECT data_key, data_value FROM workbench_data')
    .all();

  const data = Object.fromEntries(
    (result.results || []).map(row => [row.data_key, row.data_value])
  );

  return Response.json({ data });
}

export async function onRequestPut({ request, env }) {
  try {
    const body = await request.json();
    const key = String(body?.key || '');

    if (
      !key.startsWith('desk-') ||
      typeof body.value !== 'string'
    ) {
      return Response.json(
        { error: 'Invalid key or value' },
        { status: 400 }
      );
    }

    await env.DB
      .prepare(`
        INSERT INTO workbench_data
          (data_key, data_value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(data_key) DO UPDATE SET
          data_value = excluded.data_value,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(key, body.value)
      .run();

    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }
}
