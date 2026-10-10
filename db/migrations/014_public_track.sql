-- 014: what the public tracking link shows a buyer (no prices, no internals)
create or replace function public_track(p_token text) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'order_no', o.order_no, 'mill', (select name from mill), 'status', o.status, 'progress_pct', o.progress_pct,
    'current_stage', o.current_stage, 'deadline', o.deadline, 'expected_completion', o.expected_completion,
    'lines', (select jsonb_agg(jsonb_build_object('description', coalesce(l.description, i.name),
                                                  'colour', l.colour, 'qty', l.qty, 'uom', l.uom))
              from order_lines l join items i on i.id = l.item_id where l.order_id = o.id),
    'events', (select jsonb_agg(jsonb_build_object('event', e.event, 'at', e.created_at) order by e.created_at)
               from order_events e where e.order_id = o.id and e.visible_to_buyer))
  from orders o
  where o.tracking_token = p_token
$$;
