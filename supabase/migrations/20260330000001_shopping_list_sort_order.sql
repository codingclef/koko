-- Add sort_order to shopping_lists for drag-and-drop reordering
alter table shopping_lists
  add column sort_order integer not null default 0;
