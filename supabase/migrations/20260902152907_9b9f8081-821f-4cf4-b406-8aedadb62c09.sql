INSERT INTO public.storage_policy_versions (version, status, title, summary, sections, legal_review_required)
VALUES (
  '1.1.0', 'draft', 'Storage Policy',
  'What you can and can''t store through EarnRoom, and the checks we run before a booking.',
  jsonb_build_array(
    jsonb_build_object('heading','Who this applies to',
      'body','This policy applies to everyone using EarnRoom — renters storing belongings and hosts offering space. Hosts are letting a domestic space, not running a licensed storage facility.'),
    jsonb_build_object('heading','Items we never allow',
      'body','Fuel, gas cylinders and other compressed gases, explosives and fireworks, weapons and ammunition, controlled substances, biological or medical waste, live animals, and anything unlawful. These can''t be stored in a domestic space under any circumstances.'),
    jsonb_build_object('heading','Items that need extra care',
      'body','Household chemicals, batteries and other flammable goods, food and perishables, plants, liquids in bulk, medicines, cash, and irreplaceable documents are restricted. They may only be stored where the space is suitable and both people agree.'),
    jsonb_build_object('heading','Identifying what you''re storing',
      'body','Sealed or unmarked containers must be identified before a request can be sent. EarnRoom AI may suggest what it sees in your photos, but you decide and confirm what''s actually there.'),
    jsonb_build_object('heading','How checks work',
      'body','EarnRoom AI observes and proposes. You confirm or correct it. Our policy rules then decide, and the same rules are applied again on our servers when a request is sent. AI never decides whether something is lawful.'),
    jsonb_build_object('heading','Insurance and liability',
      'body','EarnRoom is a marketplace, not an insurer. Checks and estimates reduce risk — they are not a guarantee of safety, security or cover. Arrange your own insurance for anything valuable.')
  ),
  true
);

INSERT INTO public.storage_policy_rules (
  policy_version_id, rule_key, category, subcategory, decision, severity,
  requires_user_confirmation, requires_staff_review, renter_message, host_message,
  internal_reason_code, required_space_attributes, sort_order, is_active)
SELECT
  (SELECT id FROM public.storage_policy_versions WHERE version = '1.1.0'),
  r.rule_key, r.category, r.subcategory, r.decision, r.severity,
  r.requires_user_confirmation, r.requires_staff_review,
  replace(r.renter_message, 'Project Stow', 'EarnRoom'),
  replace(coalesce(r.host_message, ''), 'Project Stow', 'EarnRoom'),
  r.internal_reason_code, r.required_space_attributes, r.sort_order, r.is_active
FROM public.storage_policy_rules r
JOIN public.storage_policy_versions v ON v.id = r.policy_version_id
WHERE v.version = '1.0.0';

UPDATE public.storage_policy_versions
   SET status = 'published', effective_at = now(), published_at = now()
 WHERE version = '1.1.0';

UPDATE public.storage_policy_versions
   SET status = 'retired', retired_at = now()
 WHERE status = 'published' AND version <> '1.1.0';