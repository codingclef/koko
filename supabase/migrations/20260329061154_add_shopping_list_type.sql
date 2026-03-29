-- Add type to shopping_lists
-- 'strikethrough': check -> strikethrough display
-- 'delete': check -> item removed
alter table shopping_lists
  add column type text not null default 'strikethrough'
  check (type in ('strikethrough', 'delete'));
