-- 본인의 display_name을 직접 수정할 수 있도록 UPDATE 정책 추가
create policy "users can update their own display name"
  on family_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
