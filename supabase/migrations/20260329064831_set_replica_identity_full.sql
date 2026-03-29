-- DELETE 이벤트에서 모든 컬럼값이 payload.old에 포함되도록 설정
alter table shopping_lists replica identity full;
alter table shopping_items replica identity full;
