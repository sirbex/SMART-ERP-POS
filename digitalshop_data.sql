--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8
-- Dumped by pg_dump version 16.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: __EFMigrationsHistory; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."__EFMigrationsHistory" ("MigrationId", "ProductVersion") FROM stdin;
20251130155255_InitialCreate	8.0.11
20251202194603_AddComprehensiveAccountingSystem	8.0.11
20251203084250_AddEventDrivenAccountingProperties	8.0.11
20251203102319_AddDataSyncSupport	8.0.11
\.


--
-- Data for Name: accounting_periods; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.accounting_periods (id, period_year, period_month, period_start, period_end, status, closed_at, closed_by, close_notes, reopened_at, reopened_by, reopen_reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: accounting_period_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.accounting_period_history (id, period_id, action, performed_by, performed_at, notes, period_year, period_month, previous_status, new_status) FROM stdin;
\.


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "Description", "CurrentBalance", "CreatedAt", "UpdatedAt", "AccountClassification", "AllowAutomatedPosting", "EventTypeMapping") FROM stdin;
3f20a8c9-997b-4529-83db-ce6f823f02b8	1030	Checking Account	ASSET	DEBIT	44d95ea0-bc5f-4a29-a4d6-b226d92b3adc	1	t	t	\N	1400000.000000	2025-11-30 18:56:48.363712+03	2026-01-02 11:01:53.281641+03	\N	t	\N
d7511a99-beb4-448e-8258-b7597a2999a7	1015	Petty Cash	ASSET	DEBIT	44d95ea0-bc5f-4a29-a4d6-b226d92b3adc	2	t	t	\N	-20000.000000	2025-12-29 18:56:40.581848+03	2026-01-02 11:02:12.702693+03	\N	t	\N
1fe58bba-cb3e-4cae-9cbf-a5c9302d6446	3200	Opening Balance Equity	EQUITY	CREDIT	\N	1	t	t	\N	0.000000	2026-01-01 13:02:31.721385+03	2026-01-01 14:53:15.147589+03	\N	t	\N
9a62ebcc-c8d3-4dc1-9456-e8db6439d217	6900	General Expense	EXPENSE	DEBIT	\N	1	t	t	\N	35000.000000	2025-12-25 10:19:35.625341+03	2026-01-28 09:56:42.228154+03	\N	t	\N
a484b2c7-5413-4edc-9d2f-95e994cb5aef	2200	Customer Deposits	LIABILITY	CREDIT	a484b2c7-5413-4edc-9d2f-95e994cb5aef	1	t	t	\N	0.000000	2025-11-30 18:56:48.364015+03	2025-12-31 15:58:20.559678+03	\N	t	\N
cf607769-1cb1-4c49-be34-44146635bab5	6400	Office Supplies	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.625341+03	2025-12-31 14:23:15.223379+03	\N	t	\N
148b333d-2763-43a6-a377-1ec932bbe20d	5120	Inventory Damage	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-29 23:13:43.756593+03	2025-12-31 10:54:57.825505+03	\N	t	\N
7c6626b9-c424-487e-9281-b5cabdd69b6e	5130	Inventory Expiry	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-29 23:13:43.757423+03	2025-12-31 10:54:57.825505+03	\N	t	\N
c24b9039-cbda-4b32-81d2-7f78e7660177	3100	Retained Earnings	EQUITY	CREDIT	c24b9039-cbda-4b32-81d2-7f78e7660177	1	t	t	\N	0.000000	2025-11-30 18:56:48.364016+03	2025-12-31 10:54:57.825505+03	\N	t	\N
f1248af0-6be8-4f3a-a292-dd7023c29ba5	6200	Utilities	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.625341+03	2025-12-31 10:54:57.825505+03	\N	t	\N
d25ab2ef-8fe2-4e15-9880-a1f44fa07ca9	2000	Current Liabilities	LIABILITY	CREDIT	\N	0	f	t	\N	0.000000	2025-11-30 18:56:48.364013+03	2025-12-31 10:54:57.825505+03	\N	t	\N
38ec4327-f6d3-4b23-809f-53c3921f4312	7000	Interest Expense	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.626255+03	2025-12-31 10:54:57.825505+03	\N	t	\N
30058d56-b529-440a-84c3-49b32b75ca90	7100	Bank Charges	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.626255+03	2025-12-31 10:54:57.825505+03	\N	t	\N
71548cf8-2e61-4477-8b1b-3ea76e9137d1	1020	Credit Card Receipts	ASSET	DEBIT	44d95ea0-bc5f-4a29-a4d6-b226d92b3adc	1	t	t	\N	0.000000	2025-11-30 18:56:48.363712+03	2025-12-31 10:54:57.825505+03	\N	t	\N
1b6754da-3b4e-4d2f-9b9d-4bcc7b93170b	3000	Equity	EQUITY	CREDIT	\N	0	f	t	\N	0.000000	2025-11-30 18:56:48.364016+03	2025-12-31 10:54:57.825505+03	\N	t	\N
90a73ab2-54d3-4b71-9186-cf8738d69e5a	2100	Accounts Payable	LIABILITY	CREDIT	90a73ab2-54d3-4b71-9186-cf8738d69e5a	1	t	t	\N	1070000.000000	2025-11-30 18:56:48.364014+03	2026-01-28 09:57:05.075706+03	\N	t	\N
49a1be92-cac3-42df-9b88-f5dc08d12000	1200	Accounts Receivable	ASSET	DEBIT	49a1be92-cac3-42df-9b88-f5dc08d12000	1	t	t	\N	6000.000000	2025-11-30 18:56:48.364011+03	2026-01-02 10:05:14.543684+03	\N	t	\N
7553f38b-e133-4d80-b2ea-fb0053352c95	6850	Cash Shortage	EXPENSE	DEBIT	\N	2	t	t	\N	274000.000000	2026-01-01 20:55:29.646058+03	2026-01-02 10:09:25.052524+03	\N	t	\N
f36367f2-f318-45e0-b050-8b48ed3589de	4200	Other Income	REVENUE	CREDIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.617532+03	2025-12-31 10:54:57.825505+03	\N	t	\N
a237fccc-08ee-49c9-9e80-f654bbf24846	1010	Cash	ASSET	DEBIT	44d95ea0-bc5f-4a29-a4d6-b226d92b3adc	1	t	t	\N	590800.000000	2025-11-30 18:56:48.36371+03	2026-01-29 09:45:51.303928+03	\N	t	\N
4fd64457-4d2c-4d4b-8ea0-4cf84688d130	4110	Inventory Overage	REVENUE	CREDIT	\N	1	t	t	\N	0.000000	2025-12-29 23:13:43.758076+03	2025-12-31 23:41:30.93771+03	\N	t	\N
44d95ea0-bc5f-4a29-a4d6-b226d92b3adc	1000	Current Assets	ASSET	DEBIT	\N	0	f	t	\N	0.000000	2025-11-30 18:56:48.362975+03	2026-01-01 00:31:08.133752+03	\N	t	\N
10752759-10a1-4117-a34c-5391d0781e3f	6300	Marketing & Advertising	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.625341+03	2025-12-31 10:54:57.825505+03	\N	t	\N
e5684f15-7a9c-4157-9e1b-234b801610a2	6500	Depreciation Expense	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.625341+03	2025-12-31 10:54:57.825505+03	\N	t	\N
54719f62-f6b0-4ad3-9bfb-dc23b007d350	5110	Inventory Shrinkage	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-29 23:13:43.748447+03	2025-12-31 10:54:57.825505+03	\N	t	\N
5f566b88-cd2a-46bc-8a52-6be8e38a5395	6600	Insurance	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.625341+03	2025-12-31 10:54:57.825505+03	\N	t	\N
78c709b8-3b96-4368-ba15-ca0baa3d4867	4000	Sales Revenue	REVENUE	CREDIT	78c709b8-3b96-4368-ba15-ca0baa3d4867	1	t	t	\N	847000.000000	2025-11-30 18:56:48.364017+03	2026-01-29 09:45:51.303928+03	\N	t	\N
bd69a761-dc61-498d-8bb9-ae51977d999f	6700	Professional Fees	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.625341+03	2025-12-31 10:54:57.825505+03	\N	t	\N
66432db2-21b8-4d44-abf5-ffd90cdd8e8e	6800	Travel & Entertainment	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.625341+03	2025-12-31 10:54:57.825505+03	\N	t	\N
c2fdf60c-861c-4cf0-bff1-c6bf2bac2245	6000	Salaries & Wages	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.625341+03	2025-12-31 10:54:57.825505+03	\N	t	\N
2d73ebfb-2e87-459b-b707-5dccb0d1528f	6100	Rent Expense	EXPENSE	DEBIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.625341+03	2025-12-31 10:54:57.825505+03	\N	t	\N
7dd40838-b5a8-4008-99ea-cf308629adf1	4100	Service Revenue	REVENUE	CREDIT	\N	1	t	t	\N	0.000000	2025-12-25 10:19:35.617532+03	2025-12-31 23:44:56.368789+03	\N	t	\N
503622d7-e25b-4394-8fef-b8657bf785b4	4900	Other Income	REVENUE	CREDIT	\N	2	t	t	\N	0.000000	2026-01-01 20:55:29.653466+03	2026-01-01 21:40:54.956674+03	\N	t	\N
a4d29004-edaf-4fb8-94f4-fe33c00e1afe	5000	Cost of Goods Sold	EXPENSE	DEBIT	a4d29004-edaf-4fb8-94f4-fe33c00e1afe	1	t	t	\N	647000.000000	2025-11-30 18:56:48.364017+03	2026-01-29 09:45:51.303928+03	\N	t	\N
261d1b86-37bd-4b9e-a99f-6599e37bc059	1300	Inventory	ASSET	DEBIT	261d1b86-37bd-4b9e-a99f-6599e37bc059	1	t	t	\N	1123000.000000	2025-11-30 18:56:48.364012+03	2026-01-29 09:45:51.303928+03	\N	t	\N
\.


--
-- Data for Name: approval_limits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.approval_limits (id, role, max_amount, requires_additional_approval, is_active, created_at, updated_at) FROM stdin;
4e1c9a8f-532d-4a64-8602-138dfa196294	CASHIER	100.00	f	t	2025-12-04 23:40:23.653475+03	2025-12-04 23:40:23.653475+03
5332e6e8-cb15-419c-a581-2c4f594d8076	MANAGER	1000.00	f	t	2025-12-04 23:40:23.653475+03	2025-12-04 23:40:23.653475+03
60d335b0-a5ba-4116-bb7a-a15aa6425450	ADMIN	10000.00	t	t	2025-12-04 23:40:23.653475+03	2025-12-04 23:40:23.653475+03
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password_hash, full_name, role, is_active, created_at, updated_at, totp_secret, totp_enabled, totp_verified_at, backup_codes, password_changed_at, password_history, failed_login_attempts, lockout_until, user_number) FROM stdin;
a07cb20d-1a04-4652-871a-c6c14ab32e86	audittest@test.com	$2b$10$MDquhjKE.C02qZbdFp7PfOmVf.b10xT2ZCBw/mBtlkPtmbDwgL89K	Audit Test User	ADMIN	t	2025-11-23 12:05:47.635372+03	2026-01-02 23:57:44.585778+03	\N	f	\N	\N	2026-01-01 17:53:02.346842+03	{}	0	\N	USR-0001
1311dfe8-9996-41a9-b9db-0bf2de77840f	test.admin@samplepos.com	$2b$10$6iJdnJfPgReus1rUpshcDeVUXpL7OTh/ELlnwgn7n7p3lUndr0ZC6	Test Administrator	ADMIN	t	2025-11-24 22:24:31.308863+03	2026-01-02 23:57:44.585778+03	\N	f	\N	\N	2026-01-01 17:53:02.346842+03	{}	1	\N	USR-0002
951dbd21-372b-46c7-8636-e31667182265	testadmin@samplepos.com	$2b$10$5Epf8aOGA/C6tMjoC/FINemKtjlup37toBBofogOBdwWJFQc.dzJu	Test Admin	ADMIN	t	2025-11-23 22:59:41.389291+03	2026-01-02 23:57:44.585778+03	\N	f	\N	\N	2026-01-01 17:53:02.346842+03	{}	0	\N	USR-0003
00000000-0000-0000-0000-000000000000	system@samplepos.internal	SYSTEM_NO_LOGIN_HASH	System Automation	ADMIN	t	2025-12-29 00:18:01.58099+03	2026-01-02 23:57:44.585778+03	\N	f	\N	\N	2026-01-01 17:53:02.346842+03	{}	0	\N	USR-0004
7aa55a55-db98-4a9d-a743-d877c7d8dd21	admin@samplepos.com	$2b$12$9tQ1/M8vrubQ64kC.VVyieiQofy16FOk.i1Hsi1OrVKwSjlWoVOxC	System Administrator	ADMIN	t	2025-12-01 22:42:43.370251+03	2026-01-29 09:06:32.49644+03	JJESEM2QJI5HI5RFC4GQE42BG4QC6NYL	t	2026-01-27 12:38:55.474821+03	{feea31b85eaec512b4c2fbdb25b978544a93e1b5f2c85a7d26da98785d786c21,cc8c31840f605782e3cb70409d19e03f38fc561a4776b802a4a2c11609b83f6f,ce90d4b3830815ba9019ef0122eb283690693687eeb09714ffb2e18a64aecb6e,0e6e3f9671302eacd7e6d82bd70737bfca375fdaa1b733a700c742213c690674,cbb0069f6ef2333126f411a21eafa02cff54088e9bad06ddee3210d8d579d935,e7dd330e42d1c96ed4bd9489d8ff7b10808372f8f1e84b9a4c2204b1992c8199,eab21691b69a2228ace88d6a54765479815fa5b38b3203b433dfd32b865497b3,2721cd932eed13df4b7263a2aa200dd4e34280962c3ccba7f15266c20c276f26,066507ac2949be19ec7d104dbdbe44b0e4888eb504e74bdd2a127ca67f395b0f,7d21779533348c529186211b9d525c946e92d5f7a6f3adc880a6dba25c53550d}	2026-01-27 12:37:10.406151+03	{$2b$10$O3YuBWfZjDBFsAt0DVrqhO1ESKG3pJzettXBSRDGDqzhsaOuuCsh2}	0	\N	USR-0005
1cb55ec4-7188-45bb-a8fc-75369181cb21	test@test.com	$2b$12$v7O.U2qgS9yzSuUdkyZI5.qyTdEKfYSuLQDoOsbpxBMb0A7H6Npc2	Test User	ADMIN	t	2025-10-31 22:24:35.53842+03	2026-01-27 12:34:19.961246+03	\N	f	\N	\N	2026-01-01 17:53:02.346842+03	{}	2	\N	USR-0006
956f87a9-18cf-49ee-94b4-9c44a94a7faf	admin@test.com	$2b$12$nMUWOQzWllSvDv/2KVP32OpI8/40eWzlDauQaSFv9g5sY/sOfOb2e	Test Admin	ADMIN	t	2025-12-03 18:32:12.261666+03	2026-01-02 23:57:44.585778+03	OE4FQMJGEAVGY3BSFFTE4X3YFBMWMUCJ	t	2026-01-01 19:24:56.55699+03	{5248b5bd953ba8c2904101c2985d2cd6380813e8a7cb7dd93c73351b53be7c29,d40e4a10953c64f4b0f40a44feb771ef172d760e80700a6e98a97c7929ed3687,0c0593b36e0a795ae956113104be5ffe9c164742a8052320a9c00e4b1e3b0524,a0d7d8567d49d66b06b8ffd94276a43415a76df5753f50d59147ef19518eaf6e,e5a4b464659a8b60eb58022f43fb6c73820cd4d4983593a455f11dd4578f5c5e,8fe184d2b1fc71205a262d57e6e4ee7f5687f7fea54e9c701f47642129aba81a,497d70a26da2f6c844154e9d6696bff731943a7b8502ca56ca6bfcc341044ae0,ae843607a1cf8dd2e455ce65c12869d5217ecb0a4e3f600657fd9373e30d1b8c,127c12d389b93b3eab1c3e984a23cdb41731cdef043063be42a7733a98586511,4fbc1f15b2f89cb85096d94519407c72f3b0e5ed21b6b387b916dadb451b3508}	2026-01-01 19:06:00.271462+03	{$2b$10$d8WRL8oBmOJpdkdRXnmzTeh9qKBqvmm4KiF8WF8c2jFQLPaMPnrWm}	0	\N	USR-0007
928aa439-3efd-4efc-8238-239fb97996bc	cashtest@pos.com	$2b$12$H1l4p9FBvHMEN/2a5OTuouXH1dplhZyU0eYSAWcdX6.IMXSGq6GWq	Cash Register Tester	ADMIN	t	2026-01-01 21:14:35.623284+03	2026-01-02 23:57:44.585778+03	\N	f	\N	\N	2026-01-01 21:14:35.623284+03	{}	0	\N	USR-0008
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (id, entity_type, entity_id, entity_number, action, action_details, user_id, user_name, user_role, old_values, new_values, changes, ip_address, user_agent, session_id, request_id, severity, category, tags, created_at, notes, reference_number) FROM stdin;
3237049f-3043-4b2b-8c44-6b0c8b1d390c	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user unknown: Email and password are required	00000000-0000-0000-0000-000000000000	unknown	\N	\N	\N	\N	::1	node	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-01 11:23:09.042103+03	Email and password are required	\N
35968fe9-0c1f-4b29-8517-a0fceebdad52	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	51e83d38-a976-4890-8462-4243e38bc458	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:24:00.517978+03	\N	\N
6ccf97e3-6f19-405d-93d7-9f2ff3463931	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	97afb9f0-f59c-4fbd-9281-16041e7b01e6	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:24:21.928738+03	\N	\N
f55f5185-0697-44ef-9ff8-84f07a8b8a6f	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	41181bfa-75fd-48ea-ab13-8f638558a8cb	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:25:37.181791+03	\N	\N
a8e94fe1-6ee9-4817-999f-6347c815a853	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	c639e270-542f-4adc-a62a-636f94417803	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:26:51.398457+03	\N	\N
dd1d8953-76b3-4e50-b501-44e59aca7888	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	8f85abeb-d435-4dfe-b853-ccb9ff27329f	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:28:35.87874+03	\N	\N
44dba611-443b-49f0-a2af-b68541c72eb5	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	d154ebbe-67e3-4441-a83f-6b9df79e53d6	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:28:46.720771+03	\N	\N
f57fad89-c1d8-4156-bc48-bb3b26d5e5a7	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	00c39a1b-6201-48c9-8401-92c670384616	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:29:05.604385+03	\N	\N
db5abb0a-3506-489a-88de-abefa3fb4495	SALE	af32e00d-abf9-4aa6-82e3-f4d639b0efbc	SALE-2026-0001	CREATE	Sale SALE-2026-0001 created with 1 items, total 33750	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 8750, "itemCount": 1, "totalCost": 25000, "customerId": "bd0743b8-8438-412b-84ac-10cc02ae9553", "totalAmount": 33750, "paymentMethod": "CASH"}	\N	::1	node	\N	f66b566c-9d1b-43cf-859d-0fc112676c22	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 11:29:05.830124+03	\N	\N
3e826c53-7e45-4ff2-881d-276028c67e76	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	d3aaaf1e-b83a-407c-8ff1-e66bc41848f2	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:30:44.167791+03	\N	\N
2015ffbb-98bd-4a34-8787-68f88bd5a731	SALE	42293c11-68dd-4167-b080-ca1bbb7efe19	SALE-2026-0002	CREATE	Sale SALE-2026-0002 created with 1 items, total 33750	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 8750, "itemCount": 1, "totalCost": 25000, "customerId": "bd0743b8-8438-412b-84ac-10cc02ae9553", "totalAmount": 33750, "paymentMethod": "CASH"}	\N	::1	node	\N	f86d9b2c-1d5b-45f5-b31a-5c0e501de872	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 11:30:44.341542+03	\N	\N
d3dc3a1d-5ceb-42ed-9127-562d7e63666c	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	b61a8bfd-862a-4b9c-bfec-d3e39d489387	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:44:14.60366+03	\N	\N
5d0d2ef3-676a-449b-8930-458f967c7fed	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	3eaf9373-2ca3-4ce2-91d4-501bbea183a4	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:44:38.488233+03	\N	\N
62b7c6e1-41b7-43d1-a79f-218c70e35d61	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	f68cb174-e8d9-4a3e-b848-a9d69ffb309a	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:45:00.77116+03	\N	\N
72623f5e-5732-433a-9dc5-f25fe4f9edff	SALE	b6889161-85dc-4d8c-b710-efcaeb0ca543	SALE-2026-0003	CREATE	Sale SALE-2026-0003 created with 1 items, total 3825	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 825, "itemCount": 1, "totalCost": 3000, "customerId": "bd0743b8-8438-412b-84ac-10cc02ae9553", "totalAmount": 3825, "paymentMethod": "CASH"}	\N	::1	node	\N	9120f949-2a94-4344-a7de-a67504b21231	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 11:45:00.909614+03	\N	\N
c94ed67b-d0d9-48f3-875f-7a3b0341dba8	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	e7448fe1-f243-47d5-a674-9600e4e8f1cc	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:54:09.527319+03	\N	\N
1c213ea5-b84e-4849-9420-de0ade0b6abf	SALE	b4f0845f-4275-49b2-a54e-f44ae4202f22	SALE-2026-0004	CREATE	Sale SALE-2026-0004 created with 1 items, total 3825	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 825, "itemCount": 1, "totalCost": 3000, "customerId": "bd0743b8-8438-412b-84ac-10cc02ae9553", "totalAmount": 3825, "paymentMethod": "CASH"}	\N	::1	node	\N	b4c686cc-7326-43e0-b5be-f262478c0c2a	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 11:54:09.725929+03	\N	\N
a7f2c99a-95ea-4272-83b4-ffe61d23e8cc	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	607eedf5-e7d4-4f9a-a618-4bda97bba398	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:55:08.660663+03	\N	\N
3f3e5161-476f-413f-b550-691f2f4f7068	SALE	16dc22a5-d892-410d-b60f-bce21182b9a3	SALE-2026-0005	CREATE	Sale SALE-2026-0005 created with 1 items, total 3825	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 825, "itemCount": 1, "totalCost": 3000, "customerId": "bd0743b8-8438-412b-84ac-10cc02ae9553", "totalAmount": 3825, "paymentMethod": "CASH"}	\N	::1	node	\N	a43f449f-acd0-4e91-b6fc-5ab0c9cfde1c	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 11:55:08.848023+03	\N	\N
42de965d-d930-4cdf-b9f0-376c62d2ed56	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	f69674fc-b461-483a-805d-70db246777f2	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 11:58:27.504626+03	\N	\N
61dfcc47-01e5-41e9-9a7c-b13377bafb46	SALE	b90e9ad8-a919-44ac-9a79-c0b98a7b717c	SALE-2026-0006	CREATE	Sale SALE-2026-0006 created with 1 items, total 3825	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 825, "itemCount": 1, "totalCost": 3000, "customerId": "bd0743b8-8438-412b-84ac-10cc02ae9553", "totalAmount": 3825, "paymentMethod": "CASH"}	\N	::1	node	\N	03b68cc6-ab52-4dd0-a384-705b3df5e892	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 11:58:27.701524+03	\N	\N
6a7f2000-1ddb-44c7-90fd-83d71551b38e	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	16eb3591-e987-45ca-943a-6a0a1ade0dee	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 12:00:30.792+03	\N	\N
624f9fb5-6515-4c66-bf53-4e5d8f4a06cd	SALE	6d1995f6-887a-4cf0-be37-3ea7d53e5f1d	SALE-2026-0007	CREATE	Sale SALE-2026-0007 created with 1 items, total 3825	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 825, "itemCount": 1, "totalCost": 3000, "customerId": "bd0743b8-8438-412b-84ac-10cc02ae9553", "totalAmount": 3825, "paymentMethod": "CASH"}	\N	::1	node	\N	e7076635-0d88-45de-8f7e-ee1e9202efed	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 12:00:30.978689+03	\N	\N
62ec307e-a4db-495c-8291-855941ea0bcc	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	dff83f20-4384-4048-82b3-54e72cb6a42f	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 12:01:54.755177+03	\N	\N
b9181d1e-082b-471c-9b03-7998086162c4	SALE	d98c1e96-95d4-434f-8d21-d2c1a57656d1	SALE-2026-0008	CREATE	Sale SALE-2026-0008 created with 1 items, total 3825	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 825, "itemCount": 1, "totalCost": 3000, "customerId": "bd0743b8-8438-412b-84ac-10cc02ae9553", "totalAmount": 3825, "paymentMethod": "CASH"}	\N	::1	node	\N	0c6258ac-c19f-4104-a4b4-49250998556c	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 12:01:54.966264+03	\N	\N
0b9044ee-ef18-4d90-91cd-e9102d0ed350	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	8c3c66a1-01b6-41a0-97bc-3c2cc86168d2	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 12:05:52.324979+03	\N	\N
93546096-7740-4d4c-b953-2821bba17c80	SALE	e1c4c334-87e6-41af-99a4-416786e8008d	SALE-2026-0009	CREATE	Sale SALE-2026-0009 created with 1 items, total 3825	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 825, "itemCount": 1, "totalCost": 3000, "customerId": "bd0743b8-8438-412b-84ac-10cc02ae9553", "totalAmount": 3825, "paymentMethod": "CASH"}	\N	::1	node	\N	2bc91872-0ee8-498e-a809-be44f419899c	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 12:05:52.544432+03	\N	\N
c42cd2fd-c37f-4fea-80b6-eabcc0bdb1a6	USER	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	LOGIN	User System Administrator logged in	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	ADMIN	\N	\N	\N	::1	node	def45d5c-e0a0-4d10-a775-c6899fdc9a2d	\N	INFO	ACCESS	{user,login,auth}	2026-01-01 12:16:22.144428+03	\N	\N
7a8f9cf8-60a3-422d-8db0-ae2dea2049e4	SALE	b5077958-1ee5-46da-962b-f31a7c3291c9	SALE-2026-0010	CREATE	Sale SALE-2026-0010 created with 1 items, total 3825	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 825, "itemCount": 1, "totalCost": 3000, "customerId": "bd0743b8-8438-412b-84ac-10cc02ae9553", "totalAmount": 3825, "paymentMethod": "CASH"}	\N	::1	node	\N	90a91ed7-cc39-4cc5-bf54-ca0590b285e6	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 12:16:22.357357+03	\N	\N
a4e9a1f7-ccb5-4ec5-a75b-913128df49dd	SALE	4c924ad9-801b-487d-9b8e-030bf2069e6d	SALE-2026-0011	CREATE	Sale SALE-2026-0011 created with 1 items, total 1500	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 500, "itemCount": 1, "totalCost": 1000, "customerId": null, "totalAmount": 1500, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	e67ec898-5782-4881-8c3c-f79b0e0ed731	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 17:25:45.837965+03	\N	\N
2d269c3f-489c-4f2d-9fde-102bedf71b4d	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user admin@samplepos.com: Invalid email or password. 4 attempts remaining.	00000000-0000-0000-0000-000000000000	admin@samplepos.com	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-01 18:28:26.554928+03	Invalid email or password. 4 attempts remaining.	\N
f8f56f26-9587-488f-97b1-7f586e45905b	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user test@test.com: Invalid email or password. 4 attempts remaining.	00000000-0000-0000-0000-000000000000	test@test.com	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-01 18:29:12.594072+03	Invalid email or password. 4 attempts remaining.	\N
41c85ca2-c8b4-448b-9b79-d91bd2c16e9b	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user admin@test.comf: Invalid email or password	00000000-0000-0000-0000-000000000000	admin@test.comf	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-01 18:43:52.31373+03	Invalid email or password	\N
1acf4faa-8697-4c33-beae-6492870057e5	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user admin@test.comf: Invalid email or password	00000000-0000-0000-0000-000000000000	admin@test.comf	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-01 18:43:59.93227+03	Invalid email or password	\N
62f6fc89-1dc5-4a65-afd0-cd8c577662f4	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user admin@test.comf: Invalid email or password	00000000-0000-0000-0000-000000000000	admin@test.comf	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-01 18:44:02.180175+03	Invalid email or password	\N
a42fbb45-f0ac-4759-9f7f-b9872bcbfbf6	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user admin@test.comf: Invalid email or password	00000000-0000-0000-0000-000000000000	admin@test.comf	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-01 18:44:04.89345+03	Invalid email or password	\N
2dc468a4-b870-4722-a4d2-a9f5afc76cfe	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user admin@test.comf: Invalid email or password	00000000-0000-0000-0000-000000000000	admin@test.comf	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-01 18:44:09.107539+03	Invalid email or password	\N
eaf3e753-57fd-4d69-bbd0-ccbc50e02213	SALE	ce052978-853a-4a6e-b695-be1b6938375e	SALE-2026-0012	CREATE	Sale SALE-2026-0012 created with 1 items, total 1500	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 500, "itemCount": 1, "totalCost": 1000, "customerId": null, "totalAmount": 1500, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	0d01de4c-fecf-4c97-b39c-281429c64108	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 19:26:05.436031+03	\N	\N
39e26dc0-6eb0-413c-9cc9-764ad0fde2a1	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user unknown: Email and password are required	00000000-0000-0000-0000-000000000000	unknown	\N	\N	\N	\N	::1	node	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-01 21:12:14.710288+03	Email and password are required	\N
8251b1c0-b8ef-40c0-b30e-d20aa4c5d4e1	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user test.admin@samplepos.com: Invalid email or password. 4 attempts remaining.	00000000-0000-0000-0000-000000000000	test.admin@samplepos.com	\N	\N	\N	\N	::1	node	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-01 21:14:00.298529+03	Invalid email or password. 4 attempts remaining.	\N
4ad8a344-950b-4614-a27d-776b3145049c	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user cashtest@pos.com: Invalid email or password. 4 attempts remaining.	00000000-0000-0000-0000-000000000000	cashtest@pos.com	\N	\N	\N	\N	::1	node	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-01 21:14:48.661201+03	Invalid email or password. 4 attempts remaining.	\N
aa96dc42-a0dd-4b5f-9347-d01676f95a43	SYSTEM	9d95b4bb-e0f7-446e-a760-6313afe159e3	\N	CREATE	{"transactionNumber":"TXN-000002","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0001","totalDebits":10,"totalCredits":10,"lineCount":2}	928aa439-3efd-4efc-8238-239fb97996bc	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 21:18:39.410209+03	\N	\N
349fe100-9dc8-47a1-9755-fcb4b4ce83d7	SYSTEM	81f5d49c-af3b-4fff-933f-8be3a059f6ce	\N	CREATE	{"transactionNumber":"TXN-000003","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0002","totalDebits":4.5,"totalCredits":4.5,"lineCount":2}	928aa439-3efd-4efc-8238-239fb97996bc	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 21:18:40.000403+03	\N	\N
68e2c029-1aa6-49f7-a332-3d96331709d9	SYSTEM	e7e7644b-d9f7-4659-b0a5-731352c5bc28	\N	CREATE	{"transactionNumber":"TXN-000004","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0005","totalDebits":10,"totalCredits":10,"lineCount":2}	928aa439-3efd-4efc-8238-239fb97996bc	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 21:19:09.970708+03	\N	\N
e2743383-d3e5-4dba-8245-3b57e8963ef0	SYSTEM	44c84fd9-4771-46ef-9abf-82b5a9677c62	\N	CREATE	{"transactionNumber":"TXN-000005","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0006","totalDebits":4.5,"totalCredits":4.5,"lineCount":2}	928aa439-3efd-4efc-8238-239fb97996bc	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 21:19:10.64134+03	\N	\N
23cd71ab-40fa-4c49-b0cd-884069e7db9d	SYSTEM	7acb2b5f-75bc-4152-b88b-239e87b49e42	\N	CREATE	{"transactionNumber":"TXN-000006","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0009","totalDebits":10,"totalCredits":10,"lineCount":2}	928aa439-3efd-4efc-8238-239fb97996bc	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 21:22:13.811886+03	\N	\N
3667777a-3c8c-49b4-ac11-73293e7ecdb1	SYSTEM	b1cf3923-f89d-4f80-b88c-adfd6ba1d962	\N	CREATE	{"transactionNumber":"TXN-000007","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0010","totalDebits":4.5,"totalCredits":4.5,"lineCount":2}	928aa439-3efd-4efc-8238-239fb97996bc	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 21:22:14.456821+03	\N	\N
99ae2736-ea03-4111-9158-bf285b8eb829	SYSTEM	f2d4e7e4-f331-4032-93bf-3c39f6cef2cb	\N	CREATE	{"transactionNumber":"TXN-000008","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0013","totalDebits":10,"totalCredits":10,"lineCount":2}	928aa439-3efd-4efc-8238-239fb97996bc	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 21:40:53.885444+03	\N	\N
6faac14b-e7d5-48af-8779-fe9f3a9537c1	SYSTEM	0e34e6c4-e206-429e-915b-07313f786e56	\N	CREATE	{"transactionNumber":"TXN-000009","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0014","totalDebits":4.5,"totalCredits":4.5,"lineCount":2}	928aa439-3efd-4efc-8238-239fb97996bc	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 21:40:54.537511+03	\N	\N
0ea1eda1-ae6e-4954-b573-e967a3e68701	SYSTEM	45b34fc7-4759-4274-90d1-31835cc9e829	\N	CREATE	{"transactionNumber":"TXN-000010","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0017","totalDebits":25,"totalCredits":25,"lineCount":2}	928aa439-3efd-4efc-8238-239fb97996bc	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 21:40:54.706975+03	\N	\N
aae831c9-15f8-48f0-afff-fbfe940bb276	SYSTEM	944aeafc-a585-4485-9597-8c2d11f74a3e	\N	CREATE	{"transactionNumber":"TXN-000011","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0018","totalDebits":5000,"totalCredits":5000,"lineCount":2}	928aa439-3efd-4efc-8238-239fb97996bc	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 21:40:54.759509+03	\N	\N
8dc806a4-866e-4042-b3fd-419a0513f507	SYSTEM	37fd72ac-14ab-4a00-acc1-f004ec7e86ad	\N	CREATE	{"transactionNumber":"TXN-000012","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0021","totalDebits":50,"totalCredits":50,"lineCount":2}	928aa439-3efd-4efc-8238-239fb97996bc	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 21:40:54.956674+03	\N	\N
0d10a395-ad4b-4fa6-983d-0f199b487c2b	SALE	f65721e4-35ed-44fd-ac2b-657a8d7469a1	SALE-2026-0013	CREATE	Sale SALE-2026-0013 created with 1 items, total 1500	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 500, "itemCount": 1, "totalCost": 1000, "customerId": null, "totalAmount": 1500, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	635274db-03a7-473d-9b16-ba72351bf407	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 21:43:37.198345+03	\N	\N
aa51cbab-8663-47f1-991f-9b49d67f3a79	SALE	76bd02b1-b16c-42c9-8806-a6131193a87e	SALE-2026-0014	CREATE	Sale SALE-2026-0014 created with 1 items, total 1500	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 500, "itemCount": 1, "totalCost": 1000, "customerId": null, "totalAmount": 1500, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	8c8a662d-0180-4448-b45a-e972f1c4114a	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 21:52:04.504295+03	\N	\N
70dd40b4-9fdc-40bf-918a-be747c579316	SALE	a2a9276b-3124-4967-8a86-898c82455084	SALE-2026-0015	CREATE	Sale SALE-2026-0015 created with 1 items, total 18000	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 6000, "itemCount": 1, "totalCost": 12000, "customerId": null, "totalAmount": 18000, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	8e73c648-9986-4f2f-8d82-d939077542a3	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 22:10:44.683955+03	\N	\N
3b65b738-eae5-4fd2-b3cb-696f32c545f0	SALE	9e91a239-a6d8-4acd-9ecc-106262e80249	SALE-2026-0016	CREATE	Sale SALE-2026-0016 created with 1 items, total 18000	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 6000, "itemCount": 1, "totalCost": 12000, "customerId": null, "totalAmount": 18000, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	af66553a-e522-4988-bbde-5b374ba5b0d6	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 22:19:09.239158+03	\N	\N
e141bcd1-a9d4-4bc9-8320-1d2b2d40ecbe	SYSTEM	ad9ef95d-e55b-4950-8f78-418240694480	\N	CREATE	{"transactionNumber":"TXN-000013","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0022","totalDebits":2999,"totalCredits":2999,"lineCount":2}	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-01 22:32:44.230356+03	\N	\N
9929568b-e26a-4cb5-903b-408eab3343b5	PURCHASE_ORDER	a779b807-21fa-4f14-9761-f0cc76e35955	\N	CREATE	Purchase Order undefined created with 2 items, total undefined	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"status": "DRAFT", "itemCount": 2}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	f85bdd26-ba24-4b80-964a-a2badef14a34	INFO	FINANCIAL	{purchase-order,create,procurement}	2026-01-01 22:57:39.296364+03	\N	\N
314ece9f-605b-4ecb-84b5-416c787812a5	SALE	69136a95-4edb-453f-a5a2-42385267987d	SALE-2026-0001	CREATE	Sale SALE-2026-0001 created with 1 items, total 650000	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 150000, "itemCount": 1, "totalCost": 500000, "customerId": null, "totalAmount": 650000, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	dde70229-9e0d-4bd6-9a7a-07ed619884f1	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 23:14:50.704004+03	\N	\N
8d373d5d-9f1b-4423-a12c-eb170e8a70ca	SALE	78a50a39-c7c6-44d9-b83a-72f2245b07b1	SALE-2026-0002	CREATE	Sale SALE-2026-0002 created with 1 items, total 18000	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 6000, "itemCount": 1, "totalCost": 12000, "customerId": null, "totalAmount": 18000, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	3083b065-7c51-44f1-982e-307f84162af3	INFO	FINANCIAL	{sale,create,pos}	2026-01-01 23:16:09.350118+03	\N	\N
2f8b1ec3-5c0c-4c91-935b-559863d12b8f	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user unknown: Email and password are required	00000000-0000-0000-0000-000000000000	unknown	\N	\N	\N	\N	::1	axios/1.13.2	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-02 00:15:16.956793+03	Email and password are required	\N
7f01f8fc-cef5-4012-966b-29e4b319f477	SYSTEM	00d39e16-00ad-4efe-93bf-08787f8cfb00	\N	CREATE	{"transactionNumber":"TXN-000001","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0001","totalDebits":18000,"totalCredits":18000,"lineCount":2}	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-02 00:15:39.34405+03	\N	\N
b80e8089-48af-4e50-871e-dd4dec61793f	PURCHASE_ORDER	488c895b-b865-4c8e-95b2-784536799353	\N	CREATE	Purchase Order undefined created with 3 items, total undefined	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"status": "DRAFT", "itemCount": 3}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	a6d0caa2-718d-4ce0-a8a7-068b0f201acb	INFO	FINANCIAL	{purchase-order,create,procurement}	2026-01-02 00:23:42.352529+03	\N	\N
fa8735e0-1ed6-4354-8ef7-4bb5eb09bc33	SALE	bc3e48d7-0e22-423e-95c0-23318fcff46f	SALE-2026-0001	CREATE	Sale SALE-2026-0001 created with 1 items, total 260000	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 60000, "itemCount": 1, "totalCost": 200000, "customerId": null, "totalAmount": 260000, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	dc3c2869-2674-4a61-aa9b-a5343b8d6b34	INFO	FINANCIAL	{sale,create,pos}	2026-01-02 00:36:23.520235+03	\N	\N
0c6be8bf-17ce-43ce-bd78-a76fb87eee69	SYSTEM	9d62c534-8a3f-49b4-bbf7-253db8396ac1	\N	CREATE	{"transactionNumber":"TXN-000001","referenceType":"BANK_TXN","referenceNumber":"BTX-2026-0001","totalDebits":200000,"totalCredits":200000,"lineCount":2}	00000000-0000-0000-0000-000000000000	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-02 00:38:51.598367+03	\N	\N
921b0d93-bd20-4a7e-8eec-1b93774f54e4	SYSTEM	dfbb9efd-2dc6-4a23-bfaf-a631b8494048	\N	CREATE	{"transactionNumber":"BTX-2026-0001","type":"WITHDRAWAL","amount":200000,"glTransactionId":"9d62c534-8a3f-49b4-bbf7-253db8396ac1"}	00000000-0000-0000-0000-000000000000	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-02 00:38:51.400831+03	\N	\N
e3616beb-8111-4ab2-9345-7c7f13dc3477	SYSTEM	400afc24-7a61-4d42-8296-94be0d04688d	\N	CREATE	{"transactionNumber":"TXN-000002","referenceType":"BANK_TXN","referenceNumber":"BTX-2026-0002","totalDebits":2000000,"totalCredits":2000000,"lineCount":2}	00000000-0000-0000-0000-000000000000	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-02 00:40:06.446244+03	\N	\N
bd2ed817-2ac4-4769-935a-8bc000b50091	SYSTEM	8aba6647-d587-4696-84d6-c1f88d77e379	\N	CREATE	{"transactionNumber":"BTX-2026-0002","type":"DEPOSIT","amount":2000000,"glTransactionId":"400afc24-7a61-4d42-8296-94be0d04688d"}	00000000-0000-0000-0000-000000000000	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-02 00:40:06.399584+03	\N	\N
f10505b5-d792-4f98-9ede-58ab08bda2e7	SYSTEM	b3b93d18-af2b-4dcf-9853-2f656df1a116	\N	CREATE	{"transactionNumber":"TXN-000003","referenceType":"BANK_TRANSFER","referenceNumber":"BTX-2026-0003/BTX-2026-0004","totalDebits":500000,"totalCredits":500000,"lineCount":2}	00000000-0000-0000-0000-000000000000	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-02 00:40:49.509985+03	\N	\N
db4a063b-9339-4fa5-a0c3-8c2c383cbfbe	SALE	623a9d1e-5c09-41bf-8f6e-21a9a48ddbc6	SALE-2026-0002	CREATE	Sale SALE-2026-0002 created with 1 items, total 6500	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 1500, "itemCount": 1, "totalCost": 5000, "customerId": null, "totalAmount": 6500, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	1cb38ca8-42a6-492b-8ba7-2bbaa1797708	INFO	FINANCIAL	{sale,create,pos}	2026-01-02 00:50:02.730965+03	\N	\N
466ecb8c-db0e-4792-b496-e72edd17cbd0	SALE	1204acdb-8834-4657-9f90-e1d11bb4c1fb	SALE-2026-0003	CREATE	Sale SALE-2026-0003 created with 1 items, total 6500	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 1500, "itemCount": 1, "totalCost": 5000, "customerId": null, "totalAmount": 6500, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	cbd73f5d-83c1-44fa-84f4-8b028b5f9c77	INFO	FINANCIAL	{sale,create,pos}	2026-01-02 10:05:13.503473+03	\N	\N
897d588f-44ff-4bce-a2d2-8d5a4ccbedcc	SALE	0ff95ae6-4948-44c5-baf4-bfdab802958e	SALE-2026-0004	CREATE	Sale SALE-2026-0004 created with 1 items, total 130000	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 30000, "itemCount": 1, "totalCost": 100000, "customerId": null, "totalAmount": 130000, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	a39c524e-ded7-4087-835b-f17514ddd8b4	INFO	FINANCIAL	{sale,create,pos}	2026-01-02 10:05:14.196822+03	\N	\N
3864d6ef-cd37-44ee-bac6-98846d44d117	SALE	adad804b-bd8c-458e-89f4-a2bbd083ab60	SALE-2026-0005	CREATE	Sale SALE-2026-0005 created with 1 items, total 6500	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 1500, "itemCount": 1, "totalCost": 5000, "customerId": "e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3", "totalAmount": 6500, "paymentMethod": "CREDIT"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	d53ba01a-0673-4092-a870-e4525b3c8688	INFO	FINANCIAL	{sale,create,pos}	2026-01-02 10:05:14.863741+03	\N	\N
14bb0e90-01ec-473e-a683-8fb96b0571fc	SYSTEM	156df591-f8cd-4f4b-b618-5b681925712a	\N	CREATE	{"transactionNumber":"TXN-000004","referenceType":"CASH_SESSION","referenceNumber":"REG-2026-0001","totalDebits":137000,"totalCredits":137000,"lineCount":2}	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-02 10:09:25.052524+03	\N	\N
abcf21f4-ee72-4009-ab71-ac4e6bc26e01	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user admin@test.com: Invalid email or password. 4 attempts remaining.	00000000-0000-0000-0000-000000000000	admin@test.com	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-02 10:09:51.728758+03	Invalid email or password. 4 attempts remaining.	\N
284ea1f6-7ed4-4f4f-86cf-b1b369e82f6b	SYSTEM	d7c0331f-5e22-4310-872c-446e863681be	\N	CREATE	{"transactionNumber":"TXN-000005","referenceType":"CASH_MOVEMENT","referenceNumber":"REG-2026-0002","totalDebits":25000,"totalCredits":25000,"lineCount":2}	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-02 11:01:25.088232+03	\N	\N
1a45667c-65ba-4cd4-b81d-7008beb5cfe6	SYSTEM	89c536a7-56c3-459e-97db-ebe248bd372c	\N	CREATE	{"transactionNumber":"TXN-000006","referenceType":"CASH_MOVEMENT","referenceNumber":"REG-2026-0002","totalDebits":100000,"totalCredits":100000,"lineCount":2}	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-02 11:01:53.281641+03	\N	\N
6b64c756-aea4-4e72-aed7-b48999713961	SYSTEM	4947ed6c-ecdf-4312-a042-74fc4d8f3434	\N	CREATE	{"transactionNumber":"TXN-000007","referenceType":"CASH_MOVEMENT","referenceNumber":"REG-2026-0002","totalDebits":20000,"totalCredits":20000,"lineCount":2}	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	\N	\N	\N	\N	\N	\N	\N	\N	INFO	\N	\N	2026-01-02 11:02:12.702693+03	\N	\N
566cc71b-1189-438d-980a-f2647a894782	SALE	7369e6e1-e21c-4ee1-b3e8-75b3b2b0a1bd	SALE-2026-0006	CREATE	Sale SALE-2026-0006 created with 1 items, total 6500	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 1500, "itemCount": 1, "totalCost": 5000, "customerId": null, "totalAmount": 6500, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N	b4e94a46-506c-4a81-8837-ac9208f37748	INFO	FINANCIAL	{sale,create,pos}	2026-01-02 11:51:36.959306+03	\N	\N
5ea6db47-198e-4760-ba48-349c9cf33748	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user unknown: Email and password are required	00000000-0000-0000-0000-000000000000	unknown	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-02 15:10:06.332506+03	Email and password are required	\N
880b30e1-7f2a-480e-a5c8-a24adb33a0db	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user test@test.com: Invalid email or password. 4 attempts remaining.	00000000-0000-0000-0000-000000000000	test@test.com	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-27 12:34:09.550369+03	Invalid email or password. 4 attempts remaining.	\N
ed8f9df4-d28a-4f22-9bd6-3c76d8050ab6	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user test@test.com: Invalid email or password. 3 attempts remaining.	00000000-0000-0000-0000-000000000000	test@test.com	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-27 12:34:19.967843+03	Invalid email or password. 3 attempts remaining.	\N
99832280-33e0-41ab-9ec5-c4cbd19ec651	USER	\N	\N	LOGIN_FAILED	Failed login attempt for user admin@samplepos.com: Invalid email or password. 4 attempts remaining.	00000000-0000-0000-0000-000000000000	admin@samplepos.com	\N	\N	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	\N	\N	WARNING	SECURITY	{user,login,failed,security}	2026-01-27 12:35:37.122479+03	Invalid email or password. 4 attempts remaining.	\N
24766d5d-106a-49aa-8cd3-83d597734b29	SALE	79cc9be3-8439-4fb6-a5f0-21233b5a911f	SALE-2026-0007	CREATE	Sale SALE-2026-0007 created with 1 items, total 130000	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 30000, "itemCount": 1, "totalCost": 100000, "customerId": null, "totalAmount": 130000, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	\N	142e467d-0a67-4fb1-ab0d-565cadb9bac5	INFO	FINANCIAL	{sale,create,pos}	2026-01-28 22:57:59.795304+03	\N	\N
2aa8545e-6125-44db-b1d0-913a26a63113	SALE	c71211a2-7934-473f-8338-d8347f08a76b	SALE-2026-0008	CREATE	Sale SALE-2026-0008 created with 1 items, total 6500	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 1500, "itemCount": 1, "totalCost": 5000, "customerId": null, "totalAmount": 6500, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	\N	cc00dbe0-bb4c-42c6-b929-951a3c101578	INFO	FINANCIAL	{sale,create,pos}	2026-01-28 23:02:57.940226+03	\N	\N
9237bc27-34c7-463a-a0e4-c889925fa96b	SALE	f8643456-3f7f-4091-a05c-ce0308a562df	SALE-2026-0009	CREATE	Sale SALE-2026-0009 created with 3 items, total 144900	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 33000, "itemCount": 3, "totalCost": 111000, "customerId": null, "totalAmount": 144900, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	\N	3e7dc386-8dc5-4662-a7ae-d386880f1439	INFO	FINANCIAL	{sale,create,pos}	2026-01-29 09:25:26.877162+03	\N	\N
bae56ed0-5bff-486f-adb2-477f29066f32	SALE	f957c9d4-2720-4180-8f93-3c113178975b	SALE-2026-0010	CREATE	Sale SALE-2026-0010 created with 3 items, total 144900	00000000-0000-0000-0000-000000000000	\N	\N	\N	{"profit": 33000, "itemCount": 3, "totalCost": 111000, "customerId": null, "totalAmount": 144900, "paymentMethod": "CASH"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	\N	0957e84e-74b1-4323-9a67-28d42803d563	INFO	FINANCIAL	{sale,create,pos}	2026-01-29 09:45:51.504842+03	\N	\N
\.


--
-- Data for Name: bank_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_accounts (id, account_code, account_name, account_type, bank_name, account_number, currency_code, opening_balance, current_balance, is_active, is_main_cash, is_main_bank, created_at, updated_at, created_by, is_default, gl_account_id, name, branch, last_reconciled_balance, last_reconciled_at, low_balance_threshold, low_balance_alert_enabled, notes) FROM stdin;
057f9f09-1d90-4cd6-939b-a10d2aa25a60	CASH-001	Main Cash Account	CASH	\N	\N	UGX	50000.00	50000.00	t	t	f	2025-11-30 22:47:26.416977+03	2026-01-01 22:45:26.094552+03	\N	f	a237fccc-08ee-49c9-9e80-f654bbf24846	Main Cash Account	\N	\N	\N	0.00	f	\N
3d100d0d-7118-46a1-9a14-69f1b0b5d927	BNK-001	Primary Bank Account	BANK	Stanbic Bank Uganda	9030012345678	UGX	1000000.00	1000000.00	t	f	t	2025-11-30 22:47:26.420271+03	2026-01-01 22:45:26.094552+03	\N	f	3f20a8c9-997b-4529-83db-ce6f823f02b8	Primary Bank Account	\N	\N	\N	0.00	f	\N
d55fdf72-f0b2-491c-afc6-8dd4b34736e8	PETTY-001	Petty Cash	PETTY_CASH	\N	\N	UGX	10000.00	10000.00	t	f	f	2025-11-30 22:47:26.421761+03	2026-01-01 22:45:26.094552+03	\N	f	d7511a99-beb4-448e-8258-b7597a2999a7	Petty Cash	\N	\N	\N	0.00	f	\N
\.


--
-- Data for Name: bank_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_categories (id, code, name, direction, default_account_id, is_system, is_active, display_order, created_at) FROM stdin;
61ce9493-548f-45fd-b8c7-861f634afbe9	INTEREST_EARNED	Interest Earned	IN	\N	t	t	30	2025-12-29 11:05:05.872969+03
166c3f7c-53e4-4626-9458-870e88acffcf	REFUND_RECEIVED	Refund Received	IN	\N	t	t	40	2025-12-29 11:05:05.872969+03
42e2d7e5-aa41-45e2-9e89-53191edf32a9	OTHER_INCOME	Other Income	IN	\N	t	t	50	2025-12-29 11:05:05.872969+03
dd83850f-c1be-403b-bb39-6c24f22b4316	TRANSFER_IN	Transfer In	IN	\N	t	t	60	2025-12-29 11:05:05.872969+03
6dc75dba-12a2-4cf1-8ca8-720108b6ba02	EXPENSE_PAYMENT	Expense Payment	OUT	\N	t	t	120	2025-12-29 11:05:05.872969+03
fd893310-b186-4a89-b3f4-7bf8bf718139	SALARY_PAYMENT	Salary Payment	OUT	\N	t	t	140	2025-12-29 11:05:05.872969+03
838aa73c-524f-4b63-b69c-4bf2b9c2be39	TAX_PAYMENT	Tax Payment	OUT	\N	t	t	150	2025-12-29 11:05:05.872969+03
b1b8d08e-3d89-4143-bebd-aa15c6dce037	LOAN_REPAYMENT	Loan Repayment	OUT	\N	t	t	160	2025-12-29 11:05:05.872969+03
ecc10057-597a-416c-a261-13c8749aa51c	TRANSFER_OUT	Transfer Out	OUT	\N	t	t	170	2025-12-29 11:05:05.872969+03
aec30f1d-5fb1-4d44-80bf-23698b94359c	OTHER_EXPENSE	Other Expense	OUT	\N	t	t	180	2025-12-29 11:05:05.872969+03
6fcae569-928d-4692-93a8-0925a69b80d9	SALES_DEPOSIT	Sales Deposit	IN	78c709b8-3b96-4368-ba15-ca0baa3d4867	t	t	10	2025-12-29 11:05:05.872969+03
cbc109c6-7ed9-4eab-8748-d92c5e26607a	CUSTOMER_PAYMENT	Customer Payment	IN	49a1be92-cac3-42df-9b88-f5dc08d12000	t	t	20	2025-12-29 11:05:05.872969+03
8febf5f6-92a9-4315-a0a2-226e7db5a934	BANK_CHARGES	Bank Charges	OUT	30058d56-b529-440a-84c3-49b32b75ca90	t	t	130	2025-12-29 11:05:05.872969+03
ff18ca43-b55c-4530-aa42-eb71345ffe6f	SUPPLIER_PAYMENT	Supplier Payment	OUT	90a73ab2-54d3-4b71-9186-cf8738d69e5a	t	t	110	2025-12-29 11:05:05.872969+03
\.


--
-- Data for Name: bank_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_templates (id, name, bank_name, column_mappings, skip_header_rows, skip_footer_rows, delimiter, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: bank_statements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_statements (id, statement_number, bank_account_id, statement_date, period_start, period_end, opening_balance, closing_balance, file_name, template_id, total_lines, matched_lines, created_lines, skipped_lines, status, imported_by, imported_at, completed_at) FROM stdin;
\.


--
-- Data for Name: ledger_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ledger_transactions ("Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId", "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount", "Status", "CreatedById", "PostedById", "PostedAt", "ReversedByTransactionId", "ReversedAt", "CreatedAt", "UpdatedAt", "OriginalTransactionId", "ReversalTransactionId", "IsReversed", "IdempotencyKey", "CreatedBy", "ReversesTransactionId") FROM stdin;
326ccc80-6fb3-4d91-9d2e-abc21bab4283	LT-2026-000001	2026-01-02 00:24:22.055749+03	GOODS_RECEIPT	815258be-c87a-403e-b18e-07a02358b06c	GR-2026-0001	Goods Receipt: GR-2026-0001 (PO: PO-2026-0001)	1770000.000000	1770000.000000	POSTED	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	\N	\N	\N	2026-01-02 00:24:22.055749+03	2026-01-02 00:24:22.055749+03	\N	\N	f	\N	\N	\N
8ac8f672-a7df-4807-a4b5-6043739e4d72	LT-2026-000002	2026-01-02 00:27:35.79406+03	SUPPLIER_PAYMENT	e676a32c-b433-44b2-abcd-6fb7e46556c0	PAY-000001	Supplier Payment (CASH): LEXIE AND SONS - PAY-000001	500000.000000	500000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 00:27:35.79406+03	2026-01-02 00:27:35.79406+03	\N	\N	f	\N	\N	\N
86d1c198-0556-455b-85e3-705e68780cb6	LT-2026-000003	2026-01-01 03:00:00+03	SALE	bc3e48d7-0e22-423e-95c0-23318fcff46f	SALE-2026-0001	Sale: SALE-2026-0001	460000.000000	460000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 00:36:23.434124+03	2026-01-02 00:36:23.434124+03	\N	\N	f	\N	\N	\N
9d62c534-8a3f-49b4-bbf7-253db8396ac1	TXN-000001	2026-01-01 03:00:00+03	BANK_TXN	dfbb9efd-2dc6-4a23-bfaf-a631b8494048	BTX-2026-0001	customer mugisha	200000.000000	200000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 00:38:51.598367+03	2026-01-02 00:38:51.598367+03	\N	\N	f	BANK-dfbb9efd-2dc6-4a23-bfaf-a631b8494048	00000000-0000-0000-0000-000000000000	\N
400afc24-7a61-4d42-8296-94be0d04688d	TXN-000002	2026-01-01 03:00:00+03	BANK_TXN	8aba6647-d587-4696-84d6-c1f88d77e379	BTX-2026-0002	INCOME	2000000.000000	2000000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 00:40:06.446244+03	2026-01-02 00:40:06.446244+03	\N	\N	f	BANK-8aba6647-d587-4696-84d6-c1f88d77e379	00000000-0000-0000-0000-000000000000	\N
b3b93d18-af2b-4dcf-9853-2f656df1a116	TXN-000003	2026-01-01 03:00:00+03	BANK_TRANSFER	24dfaa39-4f3d-4e32-874a-471e1463a5cf	BTX-2026-0003/BTX-2026-0004	Transfer from Primary Bank Account to Main Cash Account	500000.000000	500000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 00:40:49.509985+03	2026-01-02 00:40:49.509985+03	\N	\N	f	TRANSFER-24dfaa39-4f3d-4e32-874a-471e1463a5cf	00000000-0000-0000-0000-000000000000	\N
3d2b476f-16a6-4788-a300-3d8254d52b65	LT-2026-000004	2026-01-01 03:00:00+03	SALE	623a9d1e-5c09-41bf-8f6e-21a9a48ddbc6	SALE-2026-0002	Sale: SALE-2026-0002	11500.000000	11500.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 00:50:02.647687+03	2026-01-02 00:50:02.647687+03	\N	\N	f	\N	\N	\N
d21c49fd-946f-4ab7-b90f-ecb751e25e7c	LT-2026-000005	2026-01-02 03:00:00+03	SALE	1204acdb-8834-4657-9f90-e1d11bb4c1fb	SALE-2026-0003	Sale: SALE-2026-0003	11500.000000	11500.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 10:05:13.329891+03	2026-01-02 10:05:13.329891+03	\N	\N	f	\N	\N	\N
2525ebdb-5ba1-4462-998d-fc9a153c011b	LT-2026-000006	2026-01-02 03:00:00+03	SALE	0ff95ae6-4948-44c5-baf4-bfdab802958e	SALE-2026-0004	Sale: SALE-2026-0004	230000.000000	230000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 10:05:13.845336+03	2026-01-02 10:05:13.845336+03	\N	\N	f	\N	\N	\N
a35b8afb-19c8-4704-8912-fc9a6ffb8a97	LT-2026-000007	2026-01-02 03:00:00+03	SALE	adad804b-bd8c-458e-89f4-a2bbd083ab60	SALE-2026-0005	Sale: SALE-2026-0005	11500.000000	11500.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 10:05:14.543684+03	2026-01-02 10:05:14.543684+03	\N	\N	f	\N	\N	\N
06e1a97b-0f43-491e-9825-40fe1e4f4539	LT-2026-000008	2026-01-02 10:05:14.543684+03	INVOICE	65034fcb-8556-4124-a234-276b5b7aea3e	INV-2026-0001	Customer Invoice: INV-2026-0001	6500.000000	6500.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 10:05:14.543684+03	2026-01-02 10:05:14.543684+03	\N	\N	f	\N	\N	\N
cdac9086-c40d-4e5a-8e3e-913cb3fdc8dc	LT-2026-000009	2026-01-02 10:05:14.543684+03	INVOICE_PAYMENT	137a172f-1657-41be-b6ef-0f696cd0fea2	RCPT-2026-0001	Invoice Payment: RCPT-2026-0001 for INV-2026-0001	500.000000	500.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 10:05:14.543684+03	2026-01-02 10:05:14.543684+03	\N	\N	f	\N	\N	\N
156df591-f8cd-4f4b-b618-5b681925712a	TXN-000004	2026-01-02 03:00:00+03	CASH_SESSION	a38471c3-7f06-4d8c-925e-7d62c8740014	REG-2026-0001	Cash variance - Session REG-2026-0001	137000.000000	137000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 10:09:25.052524+03	2026-01-02 10:09:25.052524+03	\N	\N	f	CASH_VAR_a38471c3-7f06-4d8c-925e-7d62c8740014	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N
d7c0331f-5e22-4310-872c-446e863681be	TXN-000005	2026-01-02 03:00:00+03	CASH_MOVEMENT	2bc2f8c9-bb38-4824-922f-6d4243681327	REG-2026-0002	Petty cash expense - Printer paper - Receipt #789	25000.000000	25000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 11:01:25.088232+03	2026-01-02 11:01:25.088232+03	\N	\N	f	CASH_MOV_2bc2f8c9-bb38-4824-922f-6d4243681327	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N
89c536a7-56c3-459e-97db-ebe248bd372c	TXN-000006	2026-01-02 03:00:00+03	CASH_MOVEMENT	786dbda8-135f-4399-a590-ad18c16c1f20	REG-2026-0002	Bank deposit - End of day deposit to Stanbic Bank	100000.000000	100000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 11:01:53.281641+03	2026-01-02 11:01:53.281641+03	\N	\N	f	CASH_MOV_786dbda8-135f-4399-a590-ad18c16c1f20	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N
4947ed6c-ecdf-4312-a042-74fc4d8f3434	TXN-000007	2026-01-02 03:00:00+03	CASH_MOVEMENT	042cf2db-a496-4bb5-8a13-467fd1a9ee71	REG-2026-0002	Float received - Session REG-2026-0002	20000.000000	20000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 11:02:12.702693+03	2026-01-02 11:02:12.702693+03	\N	\N	f	CASH_MOV_042cf2db-a496-4bb5-8a13-467fd1a9ee71	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N
df59637e-9314-4492-9582-4d796563929d	LT-2026-000010	2026-01-02 03:00:00+03	SALE	7369e6e1-e21c-4ee1-b3e8-75b3b2b0a1bd	SALE-2026-0006	Sale: SALE-2026-0006	11500.000000	11500.000000	POSTED	\N	\N	\N	\N	\N	2026-01-02 11:51:36.862564+03	2026-01-02 11:51:36.862564+03	\N	\N	f	\N	\N	\N
c5f9d162-89aa-4575-bdfc-f933af05d1bb	LT-2026-000011	2026-01-28 03:00:00+03	EXPENSE	05d39237-6e2c-45df-a6a6-f1ed201806f0	EXP-202601-5686	Expense: counting books	10000.000000	10000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-28 09:56:42.228154+03	2026-01-28 09:56:42.228154+03	\N	\N	f	\N	\N	\N
598a7202-7821-4ce6-9d9c-8f852019cbe3	LT-2026-000012	2026-01-28 03:00:00+03	EXPENSE_PAYMENT	05d39237-6e2c-45df-a6a6-f1ed201806f0	EXP-202601-5686	Payment for expense: counting books	10000.000000	10000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-28 09:57:05.075706+03	2026-01-28 09:57:05.075706+03	\N	\N	f	\N	\N	\N
49d59781-340f-481d-86df-7e6959cf65b5	LT-2026-000013	2026-01-28 03:00:00+03	SALE	79cc9be3-8439-4fb6-a5f0-21233b5a911f	SALE-2026-0007	Sale: SALE-2026-0007	230000.000000	230000.000000	POSTED	\N	\N	\N	\N	\N	2026-01-28 22:57:59.55206+03	2026-01-28 22:57:59.55206+03	\N	\N	f	\N	\N	\N
d035c487-7f45-4058-9fc3-864a3833e513	LT-2026-000014	2026-01-28 03:00:00+03	SALE	c71211a2-7934-473f-8338-d8347f08a76b	SALE-2026-0008	Sale: SALE-2026-0008	11500.000000	11500.000000	POSTED	\N	\N	\N	\N	\N	2026-01-28 23:02:57.804154+03	2026-01-28 23:02:57.804154+03	\N	\N	f	\N	\N	\N
151b9aa3-6f10-49e3-9862-b668921ec47d	LT-2026-000015	2026-01-29 03:00:00+03	SALE	f8643456-3f7f-4091-a05c-ce0308a562df	SALE-2026-0009	Sale: SALE-2026-0009	255900.000000	255900.000000	POSTED	\N	\N	\N	\N	\N	2026-01-29 09:25:26.696915+03	2026-01-29 09:25:26.696915+03	\N	\N	f	\N	\N	\N
0521b2a7-2ec0-4945-9ef8-8513914ab05a	LT-2026-000016	2026-01-29 03:00:00+03	SALE	f957c9d4-2720-4180-8f93-3c113178975b	SALE-2026-0010	Sale: SALE-2026-0010	255900.000000	255900.000000	POSTED	\N	\N	\N	\N	\N	2026-01-29 09:45:51.303928+03	2026-01-29 09:45:51.303928+03	\N	\N	f	\N	\N	\N
\.


--
-- Data for Name: bank_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_transactions (id, transaction_number, bank_account_id, transaction_date, type, category_id, description, reference, amount, running_balance, contra_account_id, gl_transaction_id, source_type, source_id, statement_line_id, matched_at, match_confidence, is_reconciled, reconciled_at, reconciled_by, transfer_pair_id, is_reversed, reversed_at, reversed_by, reversal_reason, reversal_transaction_id, created_by, created_at) FROM stdin;
dfbb9efd-2dc6-4a23-bfaf-a631b8494048	BTX-2026-0001	3d100d0d-7118-46a1-9a14-69f1b0b5d927	2026-01-01	WITHDRAWAL	ff18ca43-b55c-4530-aa42-eb71345ffe6f	customer mugisha	\N	200000.00	\N	\N	9d62c534-8a3f-49b4-bbf7-253db8396ac1	MANUAL	\N	\N	\N	\N	f	\N	\N	\N	f	\N	\N	\N	\N	00000000-0000-0000-0000-000000000000	2026-01-02 00:38:51.400831+03
8aba6647-d587-4696-84d6-c1f88d77e379	BTX-2026-0002	3d100d0d-7118-46a1-9a14-69f1b0b5d927	2026-01-01	DEPOSIT	cbc109c6-7ed9-4eab-8748-d92c5e26607a	INCOME	\N	2000000.00	\N	\N	400afc24-7a61-4d42-8296-94be0d04688d	MANUAL	\N	\N	\N	\N	f	\N	\N	\N	f	\N	\N	\N	\N	00000000-0000-0000-0000-000000000000	2026-01-02 00:40:06.399584+03
0870ca85-6eff-41bb-91b2-ccf3f12dd69f	BTX-2026-0004	057f9f09-1d90-4cd6-939b-a10d2aa25a60	2026-01-01	TRANSFER_IN	\N	Transfer from Primary Bank Account to Main Cash Account	\N	500000.00	\N	\N	b3b93d18-af2b-4dcf-9853-2f656df1a116	TRANSFER	\N	\N	\N	\N	f	\N	\N	24dfaa39-4f3d-4e32-874a-471e1463a5cf	f	\N	\N	\N	\N	00000000-0000-0000-0000-000000000000	2026-01-02 00:40:49.493101+03
24dfaa39-4f3d-4e32-874a-471e1463a5cf	BTX-2026-0003	3d100d0d-7118-46a1-9a14-69f1b0b5d927	2026-01-01	TRANSFER_OUT	\N	Transfer from Primary Bank Account to Main Cash Account	\N	500000.00	\N	\N	b3b93d18-af2b-4dcf-9853-2f656df1a116	TRANSFER	\N	\N	\N	\N	f	\N	\N	0870ca85-6eff-41bb-91b2-ccf3f12dd69f	f	\N	\N	\N	\N	00000000-0000-0000-0000-000000000000	2026-01-02 00:40:49.493101+03
\.


--
-- Data for Name: bank_statement_lines; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_statement_lines (id, statement_id, line_number, transaction_date, description, reference, amount, running_balance, match_status, matched_transaction_id, match_confidence, suggested_category_id, suggested_account_id, processed_at, processed_by, skip_reason, created_at) FROM stdin;
\.


--
-- Data for Name: bank_alerts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_alerts (id, bank_account_id, transaction_id, statement_line_id, alert_type, severity, message, details, status, resolution_notes, reviewed_by, reviewed_at, created_at) FROM stdin;
\.


--
-- Data for Name: bank_patterns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_patterns (id, description_pattern, pattern_type, category_id, category_name, account_id, priority, transaction_type, confidence, match_count, success_count, notes, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: bank_reconciliations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_reconciliations (id, reconciliation_number, bank_account_id, reconciliation_date, statement_date, book_balance, bank_balance, reconciled_balance, status, reconciled_by, reviewed_by, created_at, completed_at, notes) FROM stdin;
\.


--
-- Data for Name: bank_reconciliation_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_reconciliation_items (id, reconciliation_id, transaction_type, reference_number, transaction_date, amount, description, is_cleared, cleared_date, notes) FROM stdin;
\.


--
-- Data for Name: bank_recurring_rules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_recurring_rules (id, name, bank_account_id, match_rules, frequency, expected_day, expected_amount, tolerance_percent, category_id, contra_account_id, last_matched_at, last_matched_amount, next_expected_at, miss_count, is_active, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: bank_transaction_patterns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_transaction_patterns (id, name, match_rules, category_id, contra_account_id, confidence, times_used, times_rejected, last_used_at, auto_apply_threshold, is_system, is_active, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: cash_bank_transfers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cash_bank_transfers (id, transfer_number, transfer_type, from_account_id, to_account_id, transfer_amount, transfer_fee, transfer_date, reference_number, description, status, approved_by, approved_at, created_at, created_by) FROM stdin;
\.


--
-- Data for Name: cash_book_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cash_book_entries (id, entry_number, bank_account_id, entry_date, entry_type, transaction_type, amount, reference_number, counterparty, description, voucher_number, created_by, created_at, running_balance) FROM stdin;
\.


--
-- Data for Name: cash_registers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cash_registers (id, name, location, is_active, created_at, updated_at) FROM stdin;
188baef1-bde7-44f1-98b7-d1e3d541f5d3	Main Register	Front Counter	t	2026-01-01 20:37:35.385902+03	2026-01-01 20:37:35.385902+03
eedd0acd-8489-4077-921a-377b74e46899	Test Register 1767291366875	Test Location	f	2026-01-01 21:16:06.882707+03	2026-01-01 21:16:07.78193+03
6a629726-2da6-422a-b038-d2af51b19932	Test Register 1767291519234	Test Location	f	2026-01-01 21:18:39.246788+03	2026-01-01 21:18:40.069735+03
8952cb19-041f-45b3-ae38-b30506f7440f	Test Register 1767291549842	Test Location	f	2026-01-01 21:19:09.855547+03	2026-01-01 21:19:10.735224+03
abba5de4-0de3-4839-a291-04f0a2857f50	Test Register 1767291733693	Test Location	f	2026-01-01 21:22:13.699715+03	2026-01-01 21:22:14.54795+03
3c8fe089-d66a-43a5-a541-2f35e77690b6	Test Register 1767292853720	Test Location	t	2026-01-01 21:40:53.731056+03	2026-01-01 21:40:54.67409+03
\.


--
-- Data for Name: cash_register_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cash_register_sessions (id, register_id, user_id, session_number, status, opening_float, expected_closing, actual_closing, variance, variance_reason, opened_at, closed_at, reconciled_at, reconciled_by, notes, created_at, updated_at, blind_count_enabled, denomination_breakdown, payment_summary, variance_approved_by, variance_approved_at, variance_threshold) FROM stdin;
a38471c3-7f06-4d8c-925e-7d62c8740014	188baef1-bde7-44f1-98b7-d1e3d541f5d3	956f87a9-18cf-49ee-94b4-9c44a94a7faf	REG-2026-0001	CLOSED	50000.00	193500.00	56500.00	-137000.00	\N	2026-01-02 00:45:51.808525+03	2026-01-02 10:09:24.839444+03	\N	\N	\N	2026-01-02 00:45:51.808525+03	2026-01-02 00:45:51.808525+03	f	\N	{"CASH": 143500}	\N	\N	0.00
e7e44129-fd3a-4f5c-bd95-a57381944794	188baef1-bde7-44f1-98b7-d1e3d541f5d3	7aa55a55-db98-4a9d-a743-d877c7d8dd21	REG-2026-0002	CLOSED	50000.00	50000.00	50000.00	0.00	\N	2026-01-02 10:09:51.80402+03	2026-01-02 11:13:50.274899+03	\N	\N	\N	2026-01-02 10:09:51.80402+03	2026-01-02 10:09:51.80402+03	f	\N	{"CASH": 0}	\N	\N	0.00
fb5c55bf-da24-4706-b845-abadfcec09db	188baef1-bde7-44f1-98b7-d1e3d541f5d3	7aa55a55-db98-4a9d-a743-d877c7d8dd21	REG-2026-0003	CLOSED	0.00	0.00	0.00	0.00	\N	2026-01-02 11:13:59.307634+03	2026-01-02 11:23:01.329457+03	\N	\N	\N	2026-01-02 11:13:59.307634+03	2026-01-02 11:13:59.307634+03	f	\N	{}	\N	\N	0.00
225a3ea2-d31d-4224-bfa2-b0608be892bd	188baef1-bde7-44f1-98b7-d1e3d541f5d3	956f87a9-18cf-49ee-94b4-9c44a94a7faf	REG-2026-0004	OPEN	20000.00	\N	\N	\N	\N	2026-01-02 11:24:57.982957+03	\N	\N	\N	\N	2026-01-02 11:24:57.982957+03	2026-01-02 11:24:57.982957+03	f	\N	\N	\N	\N	0.00
c7d89389-3585-49b9-97a0-12e2f111f377	3c8fe089-d66a-43a5-a541-2f35e77690b6	7aa55a55-db98-4a9d-a743-d877c7d8dd21	REG-2026-0005	CLOSED	1000.00	291000.00	291000.00	0.00	\N	2026-01-27 12:40:06.635817+03	2026-01-29 09:37:23.531641+03	\N	\N	\N	2026-01-27 12:40:06.635817+03	2026-01-27 12:40:06.635817+03	f	\N	{"CASH": 290000}	\N	\N	0.00
2c4c2b6b-b537-484b-9bf1-b3e1e2a391f0	3c8fe089-d66a-43a5-a541-2f35e77690b6	7aa55a55-db98-4a9d-a743-d877c7d8dd21	REG-2026-0006	OPEN	2000.00	\N	\N	\N	\N	2026-01-29 09:43:53.25455+03	\N	\N	\N	\N	2026-01-29 09:43:53.25455+03	2026-01-29 09:43:53.25455+03	f	\N	\N	\N	\N	0.00
\.


--
-- Data for Name: cash_movements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cash_movements (id, session_id, user_id, movement_type, amount, reason, reference_type, reference_id, approved_by, created_at, payment_method) FROM stdin;
bd8601ac-fb88-4eb5-bc40-2505b87c5a9f	a38471c3-7f06-4d8c-925e-7d62c8740014	956f87a9-18cf-49ee-94b4-9c44a94a7faf	FLOAT_ADJUSTMENT	50000.00	Opening float	\N	\N	\N	2026-01-02 00:45:51.819219+03	\N
2e1a796d-ba8f-440d-8da5-14eac2ba84d4	a38471c3-7f06-4d8c-925e-7d62c8740014	956f87a9-18cf-49ee-94b4-9c44a94a7faf	SALE	6500.00	Cash sale	SALE	623a9d1e-5c09-41bf-8f6e-21a9a48ddbc6	\N	2026-01-02 00:50:02.726966+03	\N
b0324f9a-5416-4017-9a84-f988686266de	a38471c3-7f06-4d8c-925e-7d62c8740014	956f87a9-18cf-49ee-94b4-9c44a94a7faf	SALE	6500.00	Cash sale	SALE	1204acdb-8834-4657-9f90-e1d11bb4c1fb	\N	2026-01-02 10:05:13.494281+03	\N
5105b7e3-37ff-462d-bd4b-6d0d3182dad2	a38471c3-7f06-4d8c-925e-7d62c8740014	956f87a9-18cf-49ee-94b4-9c44a94a7faf	SALE	130000.00	Cash sale	SALE	0ff95ae6-4948-44c5-baf4-bfdab802958e	\N	2026-01-02 10:05:14.186567+03	\N
189aa885-6517-40c2-8567-f871cafc9cab	a38471c3-7f06-4d8c-925e-7d62c8740014	956f87a9-18cf-49ee-94b4-9c44a94a7faf	SALE	500.00	Cash sale	SALE	adad804b-bd8c-458e-89f4-a2bbd083ab60	\N	2026-01-02 10:05:14.851396+03	\N
148a6859-e674-44ef-bb60-7c01e7ffeac8	e7e44129-fd3a-4f5c-bd95-a57381944794	7aa55a55-db98-4a9d-a743-d877c7d8dd21	FLOAT_ADJUSTMENT	50000.00	Opening float	\N	\N	\N	2026-01-02 10:09:51.805221+03	\N
d78872e1-79b1-4d26-8bf7-18a17ec62f8a	e7e44129-fd3a-4f5c-bd95-a57381944794	7aa55a55-db98-4a9d-a743-d877c7d8dd21	CASH_IN_FLOAT	50000.00	Test float from manager	\N	\N	\N	2026-01-02 10:52:59.422155+03	\N
4c202adf-3063-4ac5-a33b-3c4ce595a5a6	e7e44129-fd3a-4f5c-bd95-a57381944794	7aa55a55-db98-4a9d-a743-d877c7d8dd21	CASH_IN_PAYMENT	75000.00	John Doe - INV-00045 payment	\N	\N	\N	2026-01-02 10:53:10.305034+03	\N
2ea06b64-62b9-4687-9b1f-8aad90e24100	e7e44129-fd3a-4f5c-bd95-a57381944794	7aa55a55-db98-4a9d-a743-d877c7d8dd21	CASH_OUT_BANK	30000.00	Daily deposit to Stanbic Bank	\N	\N	\N	2026-01-02 10:53:19.100963+03	\N
45527bb7-f6d9-450b-99e0-0e57027e3ad9	e7e44129-fd3a-4f5c-bd95-a57381944794	7aa55a55-db98-4a9d-a743-d877c7d8dd21	CASH_OUT_EXPENSE	15000.00	Office supplies - receipt #452	\N	\N	\N	2026-01-02 10:54:52.562419+03	\N
2bc2f8c9-bb38-4824-922f-6d4243681327	e7e44129-fd3a-4f5c-bd95-a57381944794	7aa55a55-db98-4a9d-a743-d877c7d8dd21	CASH_OUT_EXPENSE	25000.00	Printer paper - Receipt #789	\N	\N	\N	2026-01-02 11:01:25.08219+03	\N
786dbda8-135f-4399-a590-ad18c16c1f20	e7e44129-fd3a-4f5c-bd95-a57381944794	7aa55a55-db98-4a9d-a743-d877c7d8dd21	CASH_OUT_BANK	100000.00	End of day deposit to Stanbic Bank	\N	\N	\N	2026-01-02 11:01:53.280372+03	\N
042cf2db-a496-4bb5-8a13-467fd1a9ee71	e7e44129-fd3a-4f5c-bd95-a57381944794	7aa55a55-db98-4a9d-a743-d877c7d8dd21	CASH_IN_FLOAT	20000.00	Additional float from safe	\N	\N	\N	2026-01-02 11:02:12.701555+03	\N
b4c75a47-381c-4bd7-adaa-89279a44aa4f	fb5c55bf-da24-4706-b845-abadfcec09db	7aa55a55-db98-4a9d-a743-d877c7d8dd21	FLOAT_ADJUSTMENT	0.00	Opening float	\N	\N	\N	2026-01-02 11:13:59.309685+03	\N
25d21f63-340d-485f-812a-78bbe8af9ba5	225a3ea2-d31d-4224-bfa2-b0608be892bd	956f87a9-18cf-49ee-94b4-9c44a94a7faf	FLOAT_ADJUSTMENT	20000.00	Opening float	\N	\N	\N	2026-01-02 11:24:57.987631+03	\N
f92e966b-09ab-40a3-8202-14c982036509	225a3ea2-d31d-4224-bfa2-b0608be892bd	956f87a9-18cf-49ee-94b4-9c44a94a7faf	SALE	6500.00	Cash sale	SALE	7369e6e1-e21c-4ee1-b3e8-75b3b2b0a1bd	\N	2026-01-02 11:51:36.953343+03	\N
f1acb188-c0ac-433e-8dd9-22738059ce20	c7d89389-3585-49b9-97a0-12e2f111f377	7aa55a55-db98-4a9d-a743-d877c7d8dd21	FLOAT_ADJUSTMENT	1000.00	Opening float	\N	\N	\N	2026-01-27 12:40:06.64359+03	\N
b95f5d87-56aa-49dc-9db1-e909a77bc041	c7d89389-3585-49b9-97a0-12e2f111f377	7aa55a55-db98-4a9d-a743-d877c7d8dd21	SALE	130000.00	Cash sale	SALE	79cc9be3-8439-4fb6-a5f0-21233b5a911f	\N	2026-01-28 22:57:59.784376+03	\N
bb6bb8e4-4344-44c2-aeb9-a32fa2144901	c7d89389-3585-49b9-97a0-12e2f111f377	7aa55a55-db98-4a9d-a743-d877c7d8dd21	SALE	10000.00	Cash sale	SALE	c71211a2-7934-473f-8338-d8347f08a76b	\N	2026-01-28 23:02:57.930863+03	\N
4ca76f09-8f93-42c2-85e6-52c43ec34236	c7d89389-3585-49b9-97a0-12e2f111f377	7aa55a55-db98-4a9d-a743-d877c7d8dd21	SALE	150000.00	Cash sale	SALE	f8643456-3f7f-4091-a05c-ce0308a562df	\N	2026-01-29 09:25:26.871231+03	\N
97bb1ed1-65ab-4000-bdf5-520a2f384e4a	2c4c2b6b-b537-484b-9bf1-b3e1e2a391f0	7aa55a55-db98-4a9d-a743-d877c7d8dd21	FLOAT_ADJUSTMENT	2000.00	Opening float	\N	\N	\N	2026-01-29 09:43:53.257963+03	\N
7baee5fc-331a-4bca-8353-5d98a69a4d76	2c4c2b6b-b537-484b-9bf1-b3e1e2a391f0	7aa55a55-db98-4a9d-a743-d877c7d8dd21	SALE	160000.00	Cash sale	SALE	f957c9d4-2720-4180-8f93-3c113178975b	\N	2026-01-29 09:45:51.49934+03	\N
\.


--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_orders (id, order_number, supplier_id, order_date, expected_delivery_date, status, payment_terms, total_amount, notes, created_by_id, sent_date, created_at, updated_at, sent_to_supplier_at, sent_by_id, invoice_number, invoice_date, invoice_amount, payment_status, paid_amount, outstanding_amount, payment_due_date, manual_receipt) FROM stdin;
488c895b-b865-4c8e-95b2-784536799353	PO-2026-0001	bc489975-0afd-459b-8b09-51de6ad24072	2026-01-02 00:23:41.568+03	2026-01-02 03:00:00+03	COMPLETED	\N	1770000.00	\N	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 00:23:48.443143+03	2026-01-02 00:23:42.291301+03	2026-01-02 00:24:22.055749+03	\N	\N	\N	\N	\N	PENDING	0.00	0.00	\N	f
\.


--
-- Data for Name: goods_receipts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.goods_receipts (id, receipt_number, purchase_order_id, received_date, received_by_id, status, notes, created_at, updated_at, delivery_note_number, delivery_note_date, invoice_number, invoice_date, invoice_amount, approved_by_id, approved_at, total_value) FROM stdin;
815258be-c87a-403e-b18e-07a02358b06c	GR-2026-0001	488c895b-b865-4c8e-95b2-784536799353	2026-01-02 00:23:48.443143+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf	COMPLETED	\N	2026-01-02 00:23:48.443143+03	2026-01-02 00:24:22.055749+03	\N	\N	\N	\N	\N	\N	\N	1770000.000000
\.


--
-- Data for Name: uoms; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.uoms (id, name, symbol, type, created_at, updated_at) FROM stdin;
97c8b6ea-1d45-48c8-bf5a-2b738051aa15	Each	EA	QUANTITY	2025-11-02 02:56:49.92458+03	2025-11-02 02:56:49.92458+03
12935c09-c15f-44e9-bc2f-dbf7cf73c43b	Carton	CTN	QUANTITY	2025-11-02 02:56:49.92458+03	2025-11-02 02:56:49.92458+03
2eebd90f-837f-4b9a-966a-06596118ca5e	Dozen	DZ	QUANTITY	2025-11-02 02:56:49.92458+03	2025-11-02 02:56:49.92458+03
78bf1928-1113-4208-a688-059ca75a9b7c	Box	BOX	QUANTITY	2025-11-02 03:19:09.850169+03	2025-11-02 03:19:09.850169+03
c2411e44-71fd-42f1-bac7-0cb054dfc2ad	killogtam	kg	QUANTITY	2025-11-03 01:02:14.383869+03	2025-11-03 01:02:14.383869+03
2a5e14b0-fca8-451e-8199-491de7978a4b	BOTTLE	btl	QUANTITY	2025-11-03 09:14:30.153678+03	2025-11-03 09:14:30.153678+03
5e1a17fa-49a7-486e-9096-24f8d386ae02	TIN	TN	QUANTITY	2025-11-15 09:32:19.480224+03	2025-11-15 09:32:19.480224+03
31046657-dc01-480f-804b-35b9b762638f	Crate	CRT	QUANTITY	2025-11-15 09:36:43.774631+03	2025-11-15 09:36:43.774631+03
f9c13a3e-7c00-4d5f-9147-55158753c00d	PACKET	PKT	QUANTITY	2025-11-15 09:40:18.588606+03	2025-11-15 09:40:18.588606+03
8bd1dab1-1160-4b5a-85d0-7c73103c0d3e	Sachet	SKT	QUANTITY	2025-11-15 09:38:51.368931+03	2025-11-15 09:38:51.368931+03
b51b8119-a0b9-4886-b61f-f5d680a67c54	sack	sck	QUANTITY	2025-12-28 12:05:21.698837+03	2025-12-28 12:05:21.698837+03
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, sku, barcode, name, description, category, conversion_factor, cost_price, selling_price, costing_method, average_cost, last_cost, pricing_formula, auto_update_price, quantity_on_hand, reorder_level, is_active, created_at, updated_at, track_expiry, base_uom_id, min_price, max_discount_percentage, tax_rate, product_number, has_tax, tax_mode, is_taxable, product_type, allow_price_override, income_account_id) FROM stdin;
8879d9f3-52db-4c4f-8331-e29787bce8d5	PRD-MJPI87XV-H61U	3214500	KAKIRA SUGAR 25kg	\N	\N	1.0000	100000.00	130000.00	AVCO	100000.00	100000.00	\N	f	4.0000	10.0000	t	2025-12-28 12:07:40.519178+03	2026-01-29 09:45:51.303928+03	f	\N	\N	\N	18.00	PROD-0021	f	INCLUSIVE	f	inventory	f	\N
88fb682a-0d49-41f0-b57f-80a3ea8ded59	PRD-MHXVSIIZ-CBI8	\N	ROYCO BEEF	\N	\N	1.0000	5000.00	6500.00	STANDARD	5000.00	5000.00	\N	f	3.0000	10.0000	t	2025-11-13 23:29:51.183096+03	2026-01-29 09:45:51.303928+03	f	\N	\N	\N	0.00	PROD-0015	f	INCLUSIVE	f	inventory	f	\N
3f655de2-1a34-4bf4-9a93-789a6b04c92d	PERISH-174043	\N	Test Perishable Item - 174043	\N	Perishable	1.0000	1000.00	1500.00	FIFO	1050.00	0.00	\N	f	0.0000	10.0000	f	2025-11-01 17:40:43.268808+03	2026-01-01 10:52:55.318251+03	t	\N	\N	\N	0.00	PROD-0003	f	INCLUSIVE	f	inventory	f	\N
ba2f95ae-e41f-4932-85c2-b773f950be52	NONPERISH-174413	\N	Test Non-Perishable Item - 174413	\N	Non-Perishable	1.0000	2000.00	2800.00	FIFO	1960.00	0.00	\N	f	0.0000	5.0000	f	2025-11-01 17:44:13.067825+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0006	f	INCLUSIVE	f	inventory	f	\N
3988ca33-60c4-4648-8701-72c5484185ed	PRD-MHZZZWOT-I44Z	321452	Blue Band 500g	\N	dry goods	1.0000	6000.00	7500.00	FIFO	6000.00	6000.00	\N	f	118.0000	10.0000	t	2025-11-15 11:08:07.491322+03	2026-01-29 09:45:51.484495+03	f	\N	\N	\N	12.00	PROD-0017	f	INCLUSIVE	t	inventory	f	\N
0d282dcb-2e3f-48dc-872e-bf8507557ebb	PRD-MHKBUSYF-F0IB	321452	Blue Band 500g	\N	dry goods	1.0000	6000.00	7500.00	AVCO	500.00	500.00	\N	f	0.0000	10.0000	f	2025-11-04 11:57:07.090707+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0013	f	INCLUSIVE	f	inventory	f	\N
a40b5928-1299-444c-9fc8-a1e843c3d05c	TEST-001	\N	Test Product	Test product for API validation	Test Category	1.0000	100.00	150.00	FIFO	105.00	0.00	\N	f	0.0000	20.0000	f	2025-11-01 00:38:44.26967+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0002	f	INCLUSIVE	f	inventory	f	\N
60366069-84d8-4053-a057-7d4477727caa	PRD-MHJDP49S-VXB8	\N	Water 500ml	\N	\N	1.0000	800.00	1500.00	FIFO	1050.00	0.00	\N	t	0.0000	10.0000	f	2025-11-03 19:55:15.578274+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0009	f	INCLUSIVE	f	inventory	f	\N
088c87a4-8a80-4a7e-86ca-ca4b726334b8	NONPERISH-174043	\N	Test Non-Perishable Item - 174043	\N	Non-Perishable	1.0000	2000.00	2800.00	FIFO	1960.00	0.00	\N	f	0.0000	5.0000	f	2025-11-01 17:40:43.313353+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0004	f	INCLUSIVE	f	inventory	f	\N
8b2c82ba-226e-48cf-9103-017442eec762	25487	\N	Blue Band 500g	\N	\N	1.0000	2000.00	2500.00	FIFO	1750.00	0.00	\N	f	0.0000	10.0000	f	2025-11-04 11:01:04.920542+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	1.00	PROD-0012	f	INCLUSIVE	f	inventory	f	\N
8e197b21-431c-430a-b096-8541dec814ed	PERISH-174413	\N	Test Perishable Item - 174413	\N	Perishable	1.0000	1000.00	1500.00	FIFO	1050.00	0.00	\N	f	0.0000	10.0000	f	2025-11-01 17:44:13.035134+03	2026-01-01 10:52:55.318251+03	t	\N	\N	\N	0.00	PROD-0005	f	INCLUSIVE	f	inventory	f	\N
b00caedc-76cb-44ed-8a31-b97441881527	PRD-MHJEY2E7-DS8R	\N	Water 500ml	\N	\N	1.0000	800.00	1500.00	FIFO	800.00	800.00	\N	f	0.0000	10.0000	t	2025-11-03 20:51:22.129565+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0010	f	INCLUSIVE	f	inventory	f	\N
e01bf28f-26a3-4ec8-af60-a77b8e1f36b9	PRD-MHJN62B8-1RJW	\N	Sugar parked 1kg	\N	\N	1.0000	5500.00	6500.00	FIFO	5500.00	5500.00	\N	f	0.0000	10.0000	t	2025-11-04 00:19:00.07379+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0011	f	INCLUSIVE	f	inventory	f	\N
9dccbd37-e429-4e36-af98-655804f16e01	PRD-MHIRTEE56	\N	ROYCO CHICKEN 500ml	\N	dry goods	1.0000	5000.00	6500.00	FIFO	0.00	0.00	\N	f	0.0000	10.0000	t	2025-11-13 23:33:31.391002+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0016	f	INCLUSIVE	f	inventory	f	\N
b096a24b-e65f-4031-bf7d-1d4c26f46eea	1234	3214500	Minute Maid 300ml	\N	DRINKS	1.0000	1000.00	1500.00	FIFO	1000.00	1000.00	\N	t	0.0000	10.0000	t	2025-11-02 22:04:24.535945+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0008	f	INCLUSIVE	f	inventory	f	\N
488435a4-5239-418e-aa6b-1de89a9650a9	PRD-MJPGRF8E-28MP	3214531	RED BULL 200ml	\N	DRINKS	1.0000	6500.00	10000.00	FIFO	0.00	0.00	\N	f	0.0000	5.0000	t	2025-12-28 11:29:16.766831+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	18.00	PROD-0020	f	INCLUSIVE	f	inventory	f	\N
a12775af-de7e-4e04-b4ad-e624ee7e46a5	PRD-MHFCNFVJ-SYHW	32145	SODA 500ML	\N	DRINKS	1.0000	1000.00	1500.00	FIFO	1050.00	0.00	\N	f	0.0000	10.0000	f	2025-11-01 00:12:53.430054+03	2026-01-01 22:45:26.094552+03	f	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	\N	\N	0.00	PROD-0001	f	INCLUSIVE	f	inventory	f	\N
285eb071-5f03-4494-80dc-020fe16ffec3	PRD-MI039X01-T6PF	\N	SODA 500ML	\N	\N	1.0000	1000.00	1500.00	AVCO	0.00	0.00	\N	f	0.0000	10.0000	f	2025-11-15 12:35:58.045372+03	2026-01-01 22:45:26.094552+03	f	\N	\N	\N	0.00	PROD-0018	f	INCLUSIVE	f	inventory	f	\N
07276487-80eb-4c25-9d28-dced576c00ce	PRD-MI048QO3-ZLRS	\N	SODA 500ML	\N	\N	1.0000	1000.00	1500.00	FIFO	1000.00	1000.00	\N	f	0.0000	10.0000	t	2025-11-15 13:02:18.921875+03	2026-01-02 00:21:22.242898+03	f	\N	\N	\N	0.00	PROD-0019	f	INCLUSIVE	f	inventory	f	\N
5853e365-49e6-4bba-bfa9-cb1e73c422a8	f231aee	32145	Soap white star 1kg	\N	SOAP	1.0000	5000.00	7000.00	FIFO	5000.00	5000.00	\N	t	0.0000	10.0000	t	2025-11-02 15:53:23.607665+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	10.00	PROD-0007	f	INCLUSIVE	t	inventory	f	\N
237ea021-3da5-4cb4-92ff-d75d5df23c3c	SVC-TEST-001	\N	Test Consulting Service	\N	\N	1.0000	0.00	15000.00	FIFO	0.00	0.00	\N	f	0.0000	0.0000	t	2025-12-30 22:51:25.056628+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0022	f	INCLUSIVE	f	service	f	7dd40838-b5a8-4008-99ea-cf308629adf1
f43d8e5f-5607-4359-90a8-af885e8134e4	INV-TEST-001	\N	Test Laptop Inventory	\N	\N	1.0000	60000.00	80000.00	FIFO	0.00	0.00	\N	f	0.0000	0.0000	t	2025-12-30 22:51:25.077898+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0023	f	INCLUSIVE	f	inventory	f	78c709b8-3b96-4368-ba15-ca0baa3d4867
2b12f154-f75c-49cf-963e-b54b9482ba82	PRD-MHXR149U-ZOCH	\N	MANGO JUICE	\N	DRINKS	1.0000	1200.00	2000.00	STANDARD	1200.00	1200.00	\N	f	0.0000	10.0000	t	2025-11-13 21:28:43.252828+03	2026-01-01 10:52:55.318251+03	f	\N	\N	\N	0.00	PROD-0014	f	INCLUSIVE	f	inventory	f	\N
\.


--
-- Data for Name: cost_layers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cost_layers (id, product_id, quantity, remaining_quantity, unit_cost, received_date, batch_number, is_active, created_at, goods_receipt_id, updated_at, gl_transaction_id) FROM stdin;
de3d9bf2-5bae-4f4c-a110-071cb838868a	8879d9f3-52db-4c4f-8331-e29787bce8d5	10.0000	10.0000	100000.00	2026-01-02 00:24:22.181+03	BATCH-20260101-002	t	2026-01-02 00:24:22.182405+03	815258be-c87a-403e-b18e-07a02358b06c	2026-01-02 00:24:22.182405+03	\N
46ebd0fb-e2b6-42db-90ca-decf0fd93d4b	88fb682a-0d49-41f0-b57f-80a3ea8ded59	10.0000	10.0000	5000.00	2026-01-02 00:24:22.188+03	BATCH-20260101-003	t	2026-01-02 00:24:22.189114+03	815258be-c87a-403e-b18e-07a02358b06c	2026-01-02 00:24:22.189114+03	\N
597c2a2e-4b4a-49d9-bc65-49f6839538d9	3988ca33-60c4-4648-8701-72c5484185ed	120.0000	118.0000	6000.00	2026-01-02 00:24:22.161+03	BATCH-20260101-001	t	2026-01-02 00:24:22.161847+03	815258be-c87a-403e-b18e-07a02358b06c	2026-01-29 09:45:51.484495+03	\N
\.


--
-- Data for Name: customer_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_accounts ("Id", "CustomerId", "CustomerName", "CreditBalance", "OutstandingReceivables", "TotalDepositsReceived", "TotalDepositsApplied", "AvailableDepositBalance", "CreditLimit", "IsActive", "LastTransactionDate", "CreatedAt", "UpdatedAt", "TotalDepositBalance", "TotalCreditBalance") FROM stdin;
\.


--
-- Data for Name: customer_credits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_credits ("Id", "CustomerAccountId", "CreditAmount", "Amount", "AmountUsed", "RemainingBalance", "RemainingAmount", "CreditType", "SourceReferenceId", "SourceReferenceType", "CreditReference", "CreditDate", "Status", "ExpiryDate", "Reason", "LedgerTransactionId", "CreatedById", "CreatedAt", "UpdatedAt", "CustomerAccountId1") FROM stdin;
\.


--
-- Data for Name: credit_applications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.credit_applications ("Id", "CreditId", "CustomerCreditId", "InvoiceId", "InvoiceNumber", "AmountApplied", "ApplicationDate", "Status", "Notes", "LedgerTransactionId", "AppliedById", "ReversedByTransactionId", "ReversedAt", "CreatedAt", "UpdatedAt") FROM stdin;
\.


--
-- Data for Name: customer_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_groups (id, name, description, discount_percentage, is_active, created_at, updated_at) FROM stdin;
667e9e69-8e8c-4149-a309-7bb4b5583054	Retail Customers	Standard retail customers	0.0000	t	2025-10-31 19:03:41.442295+03	2025-10-31 19:03:41.442295+03
28e9afec-c287-420f-a452-c17c8459c304	Wholesale Customers	Bulk buyers with 10% discount	0.1000	t	2025-10-31 19:03:41.442295+03	2025-10-31 19:03:41.442295+03
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customers (id, name, email, phone, address, customer_group_id, balance, credit_limit, is_active, created_at, updated_at, customer_number) FROM stdin;
b077dc26-4382-42fd-945a-74c84c8d133a	HENRY MUGERWA	Nsamba432@gmail.com	+2567573701340	kampala	\N	0.00	0.00	t	2025-12-28 13:46:18.056134+03	2026-01-02 00:21:22.242898+03	CUST-0018
9a183752-cfb3-4a11-8b5a-6a2adae80c06	Mutumba Daude	Nsahm@gmail.com	+2567542450000	123 Luxury Street, City	\N	0.00	0.00	t	2025-11-06 21:44:32.424453+03	2026-01-02 00:21:22.242898+03	CUST-0004
a3f207ae-e1c6-412e-8485-bd455d6ed337	Test Customer 20251106-221817	test.customer+20251106221816@example.com	+256700000001	Kampala	\N	0.00	100000.00	f	2025-11-06 22:18:17.291181+03	2026-01-02 00:21:22.242898+03	CUST-0009
d789fb33-92fe-4451-a785-7d52167caf81	Test Customer 20251106-214554	test.customer@example.com	+256700000001	Kampala	\N	0.00	100000.00	f	2025-11-06 21:45:54.599002+03	2026-01-02 00:21:22.242898+03	CUST-0005
80d08190-f8c0-4f4a-bb20-3d9f4b1b4468	Quote Test Customer	quotetest@example.com	0700123456	123 Test Street	\N	0.00	0.00	t	2025-11-23 23:00:17.782747+03	2026-01-02 00:21:22.242898+03	CUST-0017
33cc4111-e0e6-47df-b299-b2e78a89ebb7	Test Customer 20251106-220931	test.customer+20251106220931@example.com	+256700000001	Kampala	\N	0.00	100000.00	f	2025-11-06 22:09:31.58441+03	2026-01-02 00:21:22.242898+03	CUST-0008
a8d693e1-2b09-4896-8acb-870aa964ec76	Invoice Customer 20251106-224738	invoice.customer+20251106224738@example.com	+256700000002	Kampala	\N	0.00	100000.00	f	2025-11-06 22:47:38.99985+03	2026-01-02 00:21:22.242898+03	CUST-0012
e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	matoo mataa	test22@test.com	+12345678900	kk1	\N	6000.00	500000.00	t	2025-11-22 23:00:36.848988+03	2026-01-02 10:05:14.543684+03	CUST-0016
d66b477a-e0ec-40e4-98b7-3a4eb12d3c15	Invoice Customer 20251106-224821	invoice.customer+20251106224820@example.com	+256700000002	Kampala	\N	0.00	100000.00	f	2025-11-06 22:48:21.040572+03	2026-01-02 00:21:22.242898+03	CUST-0013
eb9dce23-950c-4f94-b9a2-0c93f12a71c2	matama	matama@gmail.com	+25675424588	kampala	\N	0.00	0.00	f	2025-11-06 22:00:42.973716+03	2026-01-02 00:21:22.242898+03	CUST-0007
bd0743b8-8438-412b-84ac-10cc02ae9553	becca becca	Nsam12345@gmail.com	+25675424500	kampala	\N	0.00	1000000.00	t	2025-11-06 21:51:37.715878+03	2026-01-02 00:21:22.242898+03	CUST-0006
257b157c-2d57-4a42-87c0-bea9c4ebbd45	matoo mataa	test@test.com	+1 234 567 8900	kk1	\N	0.00	0.00	f	2025-11-06 21:07:47.900479+03	2026-01-02 00:21:22.242898+03	CUST-0002
e7c3c14e-6263-422a-9611-d7eb0dac8dc8	Test Customer 20251106-224341	test.customer+20251106224340@example.com	+256700000001	Kampala	\N	0.00	100000.00	f	2025-11-06 22:43:41.021492+03	2026-01-02 00:21:22.242898+03	CUST-0010
0070ee1a-db49-40af-8ae8-7cb6bb821d11	Invoice Customer 20251106-225011	invoice.customer+20251106225011@example.com	+256700000002	Kampala	\N	0.00	100000.00	f	2025-11-06 22:50:11.655727+03	2026-01-02 00:21:22.242898+03	CUST-0014
48307a71-1408-41de-965c-8978a713caa9	Edward Nsamba	Nsambaedward842@gmail.com	+256754220731	kk1	\N	0.00	0.00	t	2025-11-06 21:02:56.561301+03	2026-01-02 00:21:22.242898+03	CUST-0001
fd289f0b-dc79-48ad-b13b-052137f38897	zaman zam zam	Nsamba842@gmail.com	+256757370123	kampala	\N	0.00	1000000.00	t	2025-11-07 13:26:31.007806+03	2026-01-02 00:21:22.242898+03	CUST-0015
a3084564-f0a6-4a94-9701-27917195e5d2	becca done	Nsam@gmail.com	+256754245	kk1	\N	0.00	1000000.00	t	2025-11-06 21:29:35.977523+03	2026-01-02 00:21:22.242898+03	CUST-0003
16899ed0-4c2d-4077-8600-3ba633b6c00f	Invoice Customer 20251106-224616	invoice.customer+20251106224615@example.com	+256700000002	Kampala	\N	0.00	100000.00	f	2025-11-06 22:46:16.323034+03	2026-01-02 00:21:22.242898+03	CUST-0011
\.


--
-- Data for Name: customer_balance_adjustments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_balance_adjustments (id, customer_id, amount, reference, description, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: customer_balance_audit; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_balance_audit (id, customer_id, customer_name, old_balance, new_balance, change_amount, change_source, reference_id, created_at) FROM stdin;
6bdb7973-076e-4fbf-b770-76d9338f9ab6	e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	matoo mataa	0.00	6000.00	6000.00	TRIGGER	\N	2026-01-02 10:05:14.543684+03
8b1784e7-cf7d-4d0e-9d6c-3a6d125f6cd1	e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	matoo mataa	6000.00	6500.00	500.00	TRIGGER	\N	2026-01-02 10:05:14.543684+03
75e1d2b6-4547-4da0-b7a9-88e92b48d5b3	e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	matoo mataa	6500.00	13000.00	6500.00	TRIGGER	\N	2026-01-02 10:05:14.543684+03
14da5c4c-14c8-4d0c-842f-03e6c561049d	e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	matoo mataa	13000.00	6500.00	-6500.00	TRIGGER	\N	2026-01-02 10:05:14.543684+03
d3b95e42-672a-4f23-8833-e7f1c0d6eb74	e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	matoo mataa	6500.00	6000.00	-500.00	TRIGGER	\N	2026-01-02 10:05:14.543684+03
b5b2b626-8302-4700-8870-3d1a87f1db56	e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	matoo mataa	6000.00	5500.00	-500.00	TRIGGER	\N	2026-01-02 10:05:14.543684+03
7f775d9d-b3c2-4a06-b9b7-cde407b3644d	e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	matoo mataa	5500.00	6000.00	500.00	TRIGGER	\N	2026-01-02 10:05:14.543684+03
612f84f2-dcf3-4fcb-8980-ccb3b86c1786	e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	matoo mataa	6000.00	5500.00	-500.00	TRIGGER	\N	2026-01-02 10:05:14.543684+03
42cc90d5-44ed-4c77-bf9c-91205f4504a7	e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	matoo mataa	5500.00	6000.00	500.00	TRIGGER	\N	2026-01-02 10:05:14.543684+03
\.


--
-- Data for Name: customer_deposits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_deposits ("Id", "CustomerAccountId", "DepositAmount", "Amount", "AmountApplied", "RemainingBalance", "RemainingAmount", "DepositReference", "Reference", "PaymentMethod", "PaymentReference", "DepositDate", "Status", "Notes", "LedgerTransactionId", "CreatedById", "CreatedAt", "UpdatedAt", "CustomerAccountId1") FROM stdin;
\.


--
-- Data for Name: customer_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_payments ("Id", "PaymentNumber", "CustomerId", "CustomerName", "PaymentDate", "Amount", "PaymentMethod", "Reference", "AllocatedAmount", "UnallocatedAmount", "Status", "Notes", "CreatedAt", "UpdatedAt") FROM stdin;
\.


--
-- Data for Name: data_integrity_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_integrity_log (id, check_date, check_type, entity_type, entity_id, expected_value, actual_value, discrepancy, status, notes, created_at) FROM stdin;
\.


--
-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales (id, sale_number, customer_id, sale_date, subtotal, tax_amount, discount_amount, total_amount, total_cost, profit, profit_margin, payment_method, amount_paid, change_amount, status, notes, cashier_id, created_at, voided_at, voided_by_id, void_reason, void_approved_by_id, void_approved_at, quote_id) FROM stdin;
bc3e48d7-0e22-423e-95c0-23318fcff46f	SALE-2026-0001	\N	2026-01-01	260000.00	0.00	0.00	260000.00	200000.00	60000.00	0.2308	CASH	260000.00	0.00	COMPLETED	\N	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 00:36:23.434124+03	\N	\N	\N	\N	\N	\N
623a9d1e-5c09-41bf-8f6e-21a9a48ddbc6	SALE-2026-0002	\N	2026-01-01	6500.00	0.00	0.00	6500.00	5000.00	1500.00	0.2308	CASH	6500.00	0.00	COMPLETED	\N	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 00:50:02.647687+03	\N	\N	\N	\N	\N	\N
1204acdb-8834-4657-9f90-e1d11bb4c1fb	SALE-2026-0003	\N	2026-01-02	6500.00	0.00	0.00	6500.00	5000.00	1500.00	0.2308	CASH	6500.00	0.00	COMPLETED	\N	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 10:05:13.329891+03	\N	\N	\N	\N	\N	\N
0ff95ae6-4948-44c5-baf4-bfdab802958e	SALE-2026-0004	\N	2026-01-02	130000.00	0.00	0.00	130000.00	100000.00	30000.00	0.2308	CASH	130000.00	0.00	COMPLETED	\N	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 10:05:13.845336+03	\N	\N	\N	\N	\N	\N
adad804b-bd8c-458e-89f4-a2bbd083ab60	SALE-2026-0005	e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	2026-01-02	6500.00	0.00	0.00	6500.00	5000.00	1500.00	0.2308	CREDIT	500.00	0.00	COMPLETED	\N	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 10:05:14.543684+03	\N	\N	\N	\N	\N	\N
7369e6e1-e21c-4ee1-b3e8-75b3b2b0a1bd	SALE-2026-0006	\N	2026-01-02	6500.00	0.00	0.00	6500.00	5000.00	1500.00	0.2308	CASH	6500.00	0.00	COMPLETED	\N	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 11:51:36.862564+03	\N	\N	\N	\N	\N	\N
79cc9be3-8439-4fb6-a5f0-21233b5a911f	SALE-2026-0007	\N	2026-01-28	130000.00	0.00	0.00	130000.00	100000.00	30000.00	0.2308	CASH	130000.00	0.00	COMPLETED	\N	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-28 22:57:59.55206+03	\N	\N	\N	\N	\N	\N
c71211a2-7934-473f-8338-d8347f08a76b	SALE-2026-0008	\N	2026-01-28	6500.00	0.00	0.00	6500.00	5000.00	1500.00	0.2308	CASH	10000.00	3500.00	COMPLETED	\N	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-28 23:02:57.804154+03	\N	\N	\N	\N	\N	\N
f8643456-3f7f-4091-a05c-ce0308a562df	SALE-2026-0009	\N	2026-01-29	144000.00	900.00	0.00	144900.00	111000.00	33000.00	0.2292	CASH	150000.00	5100.00	COMPLETED	\N	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-29 09:25:26.696915+03	\N	\N	\N	\N	\N	\N
f957c9d4-2720-4180-8f93-3c113178975b	SALE-2026-0010	\N	2026-01-29	144000.00	900.00	0.00	144900.00	111000.00	33000.00	0.2292	CASH	160000.00	15100.00	COMPLETED	\N	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-29 09:45:51.303928+03	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: delivery_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delivery_orders (id, delivery_number, sale_id, invoice_id, customer_id, delivery_date, expected_delivery_time, actual_delivery_time, delivery_address, delivery_contact_name, delivery_contact_phone, special_instructions, status, assigned_driver_id, assigned_at, tracking_number, estimated_distance_km, actual_distance_km, delivery_fee, fuel_cost, total_cost, created_at, updated_at, completed_at, created_by_id, updated_by_id) FROM stdin;
\.


--
-- Data for Name: inventory_batches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_batches (id, batch_number, product_id, quantity, remaining_quantity, cost_price, expiry_date, received_date, status, notes, created_at, updated_at, goods_receipt_id, goods_receipt_item_id, purchase_order_id, purchase_order_item_id, source_type, source_reference_id, is_verified) FROM stdin;
977cc0d7-95a1-438d-81f4-194619490810	BATCH-20260101-002	8879d9f3-52db-4c4f-8331-e29787bce8d5	10.0000	4.0000	100000.00	\N	2026-01-02 00:24:22.055749+03	ACTIVE	\N	2026-01-02 00:24:22.055749+03	2026-01-29 09:45:51.303928+03	815258be-c87a-403e-b18e-07a02358b06c	f98a4b61-eebd-4e9f-afb7-9b145e8876e0	488c895b-b865-4c8e-95b2-784536799353	b28b7a70-6c60-4f7f-9b1e-94a39ce926cd	DIRECT_ENTRY	\N	f
1b2e7999-fb5d-4523-b68c-11fd3ebffee4	BATCH-20260101-003	88fb682a-0d49-41f0-b57f-80a3ea8ded59	10.0000	3.0000	5000.00	\N	2026-01-02 00:24:22.055749+03	ACTIVE	\N	2026-01-02 00:24:22.055749+03	2026-01-29 09:45:51.303928+03	815258be-c87a-403e-b18e-07a02358b06c	03aeef4a-5d95-49dd-98f8-17947f71abff	488c895b-b865-4c8e-95b2-784536799353	3d4bcc1e-911a-4e9d-b5eb-2d6964901c4b	DIRECT_ENTRY	\N	f
2ee108c7-ffaf-4011-a8b9-a13c803f25db	BATCH-20260101-001	3988ca33-60c4-4648-8701-72c5484185ed	120.0000	118.0000	6000.00	\N	2026-01-02 00:24:22.055749+03	ACTIVE	\N	2026-01-02 00:24:22.055749+03	2026-01-29 09:45:51.303928+03	815258be-c87a-403e-b18e-07a02358b06c	373681c9-130f-4e88-a02b-2dcfa89a7340	488c895b-b865-4c8e-95b2-784536799353	813bc5b8-eeed-4095-91c5-50db2ce1dfab	DIRECT_ENTRY	\N	f
\.


--
-- Data for Name: delivery_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delivery_items (id, delivery_order_id, product_id, product_name, product_code, quantity_requested, quantity_delivered, unit_of_measure, batch_id, batch_number, expiry_date, condition_on_delivery, damage_notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: delivery_proof; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delivery_proof (id, delivery_order_id, proof_type, proof_data, recipient_name, recipient_relationship, verified_at, verified_by_id, created_at) FROM stdin;
\.


--
-- Data for Name: delivery_routes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delivery_routes (id, route_name, driver_id, vehicle_id, vehicle_plate_number, route_date, planned_start_time, actual_start_time, planned_end_time, actual_end_time, total_distance_km, total_fuel_cost, route_efficiency_score, status, created_at, updated_at, created_by_id) FROM stdin;
\.


--
-- Data for Name: delivery_status_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delivery_status_history (id, delivery_order_id, old_status, new_status, status_date, latitude, longitude, location_name, notes, photo_url, changed_by_id, created_at) FROM stdin;
\.


--
-- Data for Name: deposit_applications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.deposit_applications ("Id", "DepositId", "CustomerDepositId", "InvoiceId", "InvoiceNumber", "AmountApplied", "ApplicationDate", "Status", "Notes", "LedgerTransactionId", "AppliedById", "ReversedByTransactionId", "ReversedAt", "CreatedAt", "UpdatedAt") FROM stdin;
\.


--
-- Data for Name: discounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.discounts (id, name, type, scope, value, max_discount_amount, min_purchase_amount, requires_approval, approval_roles, is_active, valid_from, valid_until, created_at, updated_at) FROM stdin;
9e79d73f-b860-4ab6-9ac0-9f7e9e1152de	Staff Discount 10%	PERCENTAGE	CART	10.00	\N	\N	f	\N	t	\N	\N	2025-11-22 00:40:30.305795+03	2025-11-22 00:40:30.305795+03
2b4d8d9d-fb2a-4b56-965b-ea1c392e0314	Manager Override 20%	PERCENTAGE	CART	20.00	\N	\N	t	["MANAGER", "ADMIN"]	t	\N	\N	2025-11-22 00:40:30.305795+03	2025-11-22 00:40:30.305795+03
d9f1c9c1-9b32-4262-bd59-419285bf0c39	Senior Citizen 5%	PERCENTAGE	CART	5.00	\N	\N	f	\N	t	\N	\N	2025-11-22 00:40:30.305795+03	2025-11-22 00:40:30.305795+03
f27c556e-3335-48cd-8623-30272876eb1c	Bulk Purchase 15%	PERCENTAGE	CART	15.00	\N	\N	t	["MANAGER", "ADMIN"]	t	\N	\N	2025-11-22 00:40:30.305795+03	2025-11-22 00:40:30.305795+03
\.


--
-- Data for Name: discount_authorizations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.discount_authorizations (id, sale_id, discount_id, discount_amount, discount_type, discount_percentage, original_amount, final_amount, reason, requested_by, requested_by_name, approved_by, approved_by_name, status, created_at, approved_at) FROM stdin;
\.


--
-- Data for Name: discount_rules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.discount_rules (id, discount_id, min_quantity, min_amount, customer_group_id, product_ids, category, created_at) FROM stdin;
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expenses (id, expense_number, title, amount, expense_date, category, status, created_at, description, category_id, supplier_id, vendor, payment_method, receipt_number, reference_number, created_by, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, paid_by, paid_at, notes, tags, updated_at, account_id, payment_status, payment_account_id) FROM stdin;
05d39237-6e2c-45df-a6a6-f1ed201806f0	EXP-202601-5686	counting books	10000.00	2026-01-28	OFFICE_SUPPLIES	PAID	2026-01-28 09:55:35.728516+03	\N	\N	\N	NWSC	CASH	\N	\N	7aa55a55-db98-4a9d-a743-d877c7d8dd21	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-28 09:56:42.227+03	\N	\N	\N	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-28 09:57:05.075+03	\N	\N	2026-01-28 09:57:05.075706+03	9a62ebcc-c8d3-4dc1-9456-e8db6439d217	PAID	a237fccc-08ee-49c9-9e80-f654bbf24846
\.


--
-- Data for Name: expense_approvals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expense_approvals (id, expense_id, approver_id, approval_level, status, decision_date, comments, created_at, updated_at) FROM stdin;
0ff62fdf-1fd2-465c-9f7f-1a2173db18ac	05d39237-6e2c-45df-a6a6-f1ed201806f0	7aa55a55-db98-4a9d-a743-d877c7d8dd21	1	APPROVED	2026-01-28 09:56:42.279076+03	\N	2026-01-28 09:56:42.279076+03	2026-01-28 09:56:42.279076+03
\.


--
-- Data for Name: expense_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expense_categories (id, name, description, code, is_active, created_at, updated_at, account_id) FROM stdin;
31bd9af1-f6f2-4524-80fd-cfca49dd1727	Office Supplies	General office supplies and materials	OFFICE	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.299113+03	cf607769-1cb1-4c49-be34-44146635bab5
92dd411b-dcc3-46cb-8cd6-8ea65463df83	Travel	Business travel expenses including flights, hotels, and transportation	TRAVEL	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.299113+03	66432db2-21b8-4d44-abf5-ffd90cdd8e8e
c34f10e2-bd45-42c5-8302-2d38aac46590	Meals & Entertainment	Business meals and client entertainment expenses	MEALS	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.299113+03	66432db2-21b8-4d44-abf5-ffd90cdd8e8e
4dfe6419-fa70-487e-bc7f-b1bb913ebb67	Fuel & Transportation	Vehicle fuel and transportation costs	FUEL	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.299113+03	66432db2-21b8-4d44-abf5-ffd90cdd8e8e
8956de81-124d-4f2d-be9f-3466806cb5fe	Utilities	Office utilities including electricity, water, internet	UTILITIES	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.299113+03	f1248af0-6be8-4f3a-a292-dd7023c29ba5
46d47378-576c-4619-9f28-80e4c7616c08	Marketing & Advertising	Marketing campaigns and advertising expenses	MARKETING	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.299113+03	10752759-10a1-4117-a34c-5391d0781e3f
69ee161e-dfe4-498c-a5ed-ad9e719acd00	Professional Services	Consulting, legal, and other professional services	PROFESSIONAL	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.299113+03	bd69a761-dc61-498d-8bb9-ae51977d999f
39bd7eea-7a7b-4b08-a2ff-7c9a3fef23ba	Maintenance & Repairs	Equipment and facility maintenance costs	MAINTENANCE	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.308716+03	9a62ebcc-c8d3-4dc1-9456-e8db6439d217
3d049d4d-de39-4c83-8f67-46ff07b51551	Equipment	Office and business equipment purchases	EQUIPMENT	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.308716+03	9a62ebcc-c8d3-4dc1-9456-e8db6439d217
069f2ef2-557d-4021-a36a-46ef0a9e16d2	Software & Licenses	Software subscriptions and license fees	SOFTWARE	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.308716+03	9a62ebcc-c8d3-4dc1-9456-e8db6439d217
0a42adfc-1c26-4061-83b1-536914a8a6ec	Accommodation	Hotel and accommodation expenses	ACCOMMODATION	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.308716+03	9a62ebcc-c8d3-4dc1-9456-e8db6439d217
43e88ca2-af32-4c90-a75a-a47cc24ed7cb	Training & Development	Employee training and development costs	TRAINING	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.308716+03	9a62ebcc-c8d3-4dc1-9456-e8db6439d217
d66ef41c-0de1-4201-8122-3623fe3101cc	Other	Miscellaneous business expenses	OTHER	t	2025-12-04 23:30:43.220117+03	2025-12-29 00:00:48.308716+03	9a62ebcc-c8d3-4dc1-9456-e8db6439d217
\.


--
-- Data for Name: expense_documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expense_documents (id, expense_id, filename, original_name, file_path, file_size, mime_type, document_type, description, uploaded_by, created_at) FROM stdin;
\.


--
-- Data for Name: failed_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.failed_transactions (id, transaction_type, attempted_data, error_type, error_message, error_stack, user_id, user_name, session_id, ip_address, user_agent, request_id, created_at, severity, notes, resolved_at, resolved_by_id, resolution_notes) FROM stdin;
\.


--
-- Data for Name: financial_periods; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.financial_periods (id, period_name, period_type, start_date, end_date, is_closed, closed_by, closed_at, created_at, "LockedAt", "LockedBy", "Status") FROM stdin;
\.


--
-- Data for Name: purchase_order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_order_items (id, purchase_order_id, product_id, ordered_quantity, received_quantity, unit_price, total_price, notes, created_at, updated_at, uom_id) FROM stdin;
813bc5b8-eeed-4095-91c5-50db2ce1dfab	488c895b-b865-4c8e-95b2-784536799353	3988ca33-60c4-4648-8701-72c5484185ed	120.0000	120.0000	6000.00	720000.00	\N	2026-01-02 00:23:42.291301+03	2026-01-02 00:23:42.291301+03	\N
b28b7a70-6c60-4f7f-9b1e-94a39ce926cd	488c895b-b865-4c8e-95b2-784536799353	8879d9f3-52db-4c4f-8331-e29787bce8d5	10.0000	10.0000	100000.00	1000000.00	\N	2026-01-02 00:23:42.291301+03	2026-01-02 00:23:42.291301+03	\N
3d4bcc1e-911a-4e9d-b5eb-2d6964901c4b	488c895b-b865-4c8e-95b2-784536799353	88fb682a-0d49-41f0-b57f-80a3ea8ded59	10.0000	10.0000	5000.00	50000.00	\N	2026-01-02 00:23:42.291301+03	2026-01-02 00:23:42.291301+03	\N
\.


--
-- Data for Name: goods_receipt_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.goods_receipt_items (id, goods_receipt_id, product_id, received_quantity, batch_number, expiry_date, cost_price, discrepancy_type, notes, created_at, uom_id, po_item_id) FROM stdin;
373681c9-130f-4e88-a02b-2dcfa89a7340	815258be-c87a-403e-b18e-07a02358b06c	3988ca33-60c4-4648-8701-72c5484185ed	120.0000	\N	\N	6000.00	NONE	\N	2026-01-02 00:23:48.443143+03	\N	813bc5b8-eeed-4095-91c5-50db2ce1dfab
f98a4b61-eebd-4e9f-afb7-9b145e8876e0	815258be-c87a-403e-b18e-07a02358b06c	8879d9f3-52db-4c4f-8331-e29787bce8d5	10.0000	\N	\N	100000.00	NONE	\N	2026-01-02 00:23:48.443143+03	\N	b28b7a70-6c60-4f7f-9b1e-94a39ce926cd
03aeef4a-5d95-49dd-98f8-17947f71abff	815258be-c87a-403e-b18e-07a02358b06c	88fb682a-0d49-41f0-b57f-80a3ea8ded59	10.0000	\N	\N	5000.00	NONE	\N	2026-01-02 00:23:48.443143+03	\N	3d4bcc1e-911a-4e9d-b5eb-2d6964901c4b
\.


--
-- Data for Name: inventory_snapshots; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_snapshots (id, product_id, batch_id, snapshot_date, quantity_on_hand, unit_cost, total_value, valuation_method, created_at) FROM stdin;
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoices ("Id", "InvoiceNumber", "CustomerId", "CustomerName", "SaleId", "InvoiceDate", "DueDate", "Subtotal", "TaxAmount", "TotalAmount", "AmountPaid", "OutstandingBalance", "Status", "PaymentTerms", "Reference", "Notes", "CreatedAt", "UpdatedAt") FROM stdin;
65034fcb-8556-4124-a234-276b5b7aea3e	INV-2026-0001	e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3	matoo mataa	adad804b-bd8c-458e-89f4-a2bbd083ab60	2026-01-02 10:05:14.727+03	2026-02-01 10:05:14.704+03	6500.000000	0.000000	6500.000000	500.000000	6000.000000	PartiallyPaid	30	\N	\N	2026-01-02 10:05:14.727+03	2026-01-02 10:05:14.543684+03
\.


--
-- Data for Name: invoice_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoice_line_items ("Id", "InvoiceId", "LineNumber", "ProductId", "ProductName", "Description", "Quantity", "UnitOfMeasure", "UnitPrice", "LineTotal", "TaxRate", "TaxAmount", "LineTotalIncludingTax") FROM stdin;
\.


--
-- Data for Name: invoice_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoice_payments (id, receipt_number, invoice_id, payment_date, payment_method, amount, reference_number, notes, processed_by_id, created_at) FROM stdin;
137a172f-1657-41be-b6ef-0f696cd0fea2	RCPT-2026-0001	65034fcb-8556-4124-a234-276b5b7aea3e	2026-01-02 10:05:14.767+03	CASH	500.00	\N	Initial payment from sale	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 10:05:14.543684+03
\.


--
-- Data for Name: invoice_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoice_settings (id, company_name, company_address, company_phone, company_email, company_tin, company_logo_url, template_type, primary_color, secondary_color, show_company_logo, show_tax_breakdown, show_payment_instructions, payment_instructions, terms_and_conditions, footer_text, created_at, updated_at) FROM stdin;
40a95d03-602b-410e-80c9-711073dbf0d6	BLIZ INTERNATIONAL LTD	Kampala, Uganda	+256 700 123 456	bliz@gmail.com	12345678900	\N	modern	#8b5cf6	#10b981	f	t	t	Payment can be made via Mobile Money, Bank Transfer, deposits, or Cash.	\N	Thank you for your business!	2025-11-07 12:44:47.806459+03	2025-12-30 19:22:50.110288+03
\.


--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.journal_entries ("Id", "TransactionId", "Description", "EntryDate", "CreatedAt", "Status", "IdempotencyKey", "SourceEventType", "SourceEntityType", "SourceEntityId", "VoidedAt", "VoidReason", "VoidedByEntryId") FROM stdin;
\.


--
-- Data for Name: journal_entry_lines; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.journal_entry_lines ("Id", "JournalEntryId", "AccountId", "Description", "DebitAmount", "CreditAmount", "EntityType", "EntityId", "TransactionId", "Metadata", "CreatedAt") FROM stdin;
\.


--
-- Data for Name: ledger_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ledger_entries ("Id", "TransactionId", "AccountId", "EntryType", "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt", "LedgerTransactionId", "EntityId", "EntityType", "EntryDate", "JournalEntryLineId", "RunningBalance") FROM stdin;
b74ab6fc-58b1-4ee0-871c-d0aa45cebeca	326ccc80-6fb3-4d91-9d2e-abc21bab4283	261d1b86-37bd-4b9e-a99f-6599e37bc059	DEBIT	1770000.000000	1770000.000000	0.000000	Goods Receipt: GR-2026-0001 (PO: PO-2026-0001)	1	2026-01-02 00:24:22.055749+03	\N	\N	\N	2026-01-02 00:24:22.055749+03	\N	0.000000
df36c0d1-d8c7-4883-8dae-60c2001b9ec3	326ccc80-6fb3-4d91-9d2e-abc21bab4283	90a73ab2-54d3-4b71-9186-cf8738d69e5a	CREDIT	1770000.000000	0.000000	1770000.000000	Goods Receipt: GR-2026-0001 (PO: PO-2026-0001)	2	2026-01-02 00:24:22.055749+03	\N	\N	\N	2026-01-02 00:24:22.055749+03	\N	0.000000
714e4f04-3d98-4c5c-a057-634c23189d40	8ac8f672-a7df-4807-a4b5-6043739e4d72	90a73ab2-54d3-4b71-9186-cf8738d69e5a	DEBIT	500000.000000	500000.000000	0.000000	AP reduced - LEXIE AND SONS	1	2026-01-02 00:27:35.79406+03	8ac8f672-a7df-4807-a4b5-6043739e4d72	e676a32c-b433-44b2-abcd-6fb7e46556c0	SUPPLIER_PAYMENT	2026-01-02 00:27:35.79406+03	\N	0.000000
2f928aac-00e6-4e91-af68-db1855b49253	8ac8f672-a7df-4807-a4b5-6043739e4d72	a237fccc-08ee-49c9-9e80-f654bbf24846	CREDIT	500000.000000	0.000000	500000.000000	Payment to supplier (CASH) - LEXIE AND SONS	2	2026-01-02 00:27:35.79406+03	8ac8f672-a7df-4807-a4b5-6043739e4d72	e676a32c-b433-44b2-abcd-6fb7e46556c0	SUPPLIER_PAYMENT	2026-01-02 00:27:35.79406+03	\N	0.000000
21bb807d-1715-4cb2-a42e-9aa0e099fabd	86d1c198-0556-455b-85e3-705e68780cb6	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	260000.000000	260000.000000	0.000000	Cash received from sale SALE-2026-0001	1	2026-01-02 00:36:23.434124+03	86d1c198-0556-455b-85e3-705e68780cb6	\N	\N	2026-01-02 00:36:23.434124+03	\N	0.000000
0c5176fc-4c08-4b29-b02c-35f1bec2d47c	86d1c198-0556-455b-85e3-705e68780cb6	78c709b8-3b96-4368-ba15-ca0baa3d4867	CREDIT	260000.000000	0.000000	260000.000000	Revenue from inventory sale SALE-2026-0001	2	2026-01-02 00:36:23.434124+03	86d1c198-0556-455b-85e3-705e68780cb6	\N	\N	2026-01-02 00:36:23.434124+03	\N	0.000000
fc108bba-5674-4b37-beba-1cb6863f1609	86d1c198-0556-455b-85e3-705e68780cb6	a4d29004-edaf-4fb8-94f4-fe33c00e1afe	DEBIT	200000.000000	200000.000000	0.000000	Cost of goods sold - SALE-2026-0001	3	2026-01-02 00:36:23.434124+03	86d1c198-0556-455b-85e3-705e68780cb6	\N	\N	2026-01-02 00:36:23.434124+03	\N	0.000000
5f38041f-ea14-40e7-a6d2-40d8aa0596ce	86d1c198-0556-455b-85e3-705e68780cb6	261d1b86-37bd-4b9e-a99f-6599e37bc059	CREDIT	200000.000000	0.000000	200000.000000	Inventory reduction - SALE-2026-0001	4	2026-01-02 00:36:23.434124+03	86d1c198-0556-455b-85e3-705e68780cb6	\N	\N	2026-01-02 00:36:23.434124+03	\N	0.000000
4da5ae73-a56b-4cc1-bd21-8323618e2dec	9d62c534-8a3f-49b4-bbf7-253db8396ac1	3f20a8c9-997b-4529-83db-ce6f823f02b8	CREDIT	200000.000000	0.000000	200000.000000	customer mugisha	1	2026-01-02 00:38:51.598367+03	\N	\N	\N	2026-01-02 00:38:51.598367+03	\N	0.000000
f13a9ab0-8003-4df5-804a-59fe3488375f	9d62c534-8a3f-49b4-bbf7-253db8396ac1	90a73ab2-54d3-4b71-9186-cf8738d69e5a	DEBIT	200000.000000	200000.000000	0.000000	customer mugisha	2	2026-01-02 00:38:51.598367+03	\N	\N	\N	2026-01-02 00:38:51.598367+03	\N	0.000000
797d706f-b36e-4790-b9fb-cc1621174882	400afc24-7a61-4d42-8296-94be0d04688d	3f20a8c9-997b-4529-83db-ce6f823f02b8	DEBIT	2000000.000000	2000000.000000	0.000000	INCOME	1	2026-01-02 00:40:06.446244+03	\N	\N	\N	2026-01-02 00:40:06.446244+03	\N	0.000000
3c90ec05-e69b-441b-abbe-030de423aa73	400afc24-7a61-4d42-8296-94be0d04688d	49a1be92-cac3-42df-9b88-f5dc08d12000	CREDIT	2000000.000000	0.000000	2000000.000000	INCOME	2	2026-01-02 00:40:06.446244+03	\N	\N	\N	2026-01-02 00:40:06.446244+03	\N	0.000000
d5daf11a-5b14-4660-8755-1c7218201b74	b3b93d18-af2b-4dcf-9853-2f656df1a116	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	500000.000000	500000.000000	0.000000	Transfer from Primary Bank Account	1	2026-01-02 00:40:49.509985+03	\N	\N	\N	2026-01-02 00:40:49.509985+03	\N	0.000000
252031f9-a45c-41eb-9f98-08ac238597ab	b3b93d18-af2b-4dcf-9853-2f656df1a116	3f20a8c9-997b-4529-83db-ce6f823f02b8	CREDIT	500000.000000	0.000000	500000.000000	Transfer to Main Cash Account	2	2026-01-02 00:40:49.509985+03	\N	\N	\N	2026-01-02 00:40:49.509985+03	\N	0.000000
3d9457cc-449e-4523-9cfd-4456c878885f	3d2b476f-16a6-4788-a300-3d8254d52b65	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	6500.000000	6500.000000	0.000000	Cash received from sale SALE-2026-0002	1	2026-01-02 00:50:02.647687+03	3d2b476f-16a6-4788-a300-3d8254d52b65	\N	\N	2026-01-02 00:50:02.647687+03	\N	0.000000
4601315b-adfd-4215-98dc-52844d17aefa	3d2b476f-16a6-4788-a300-3d8254d52b65	78c709b8-3b96-4368-ba15-ca0baa3d4867	CREDIT	6500.000000	0.000000	6500.000000	Revenue from inventory sale SALE-2026-0002	2	2026-01-02 00:50:02.647687+03	3d2b476f-16a6-4788-a300-3d8254d52b65	\N	\N	2026-01-02 00:50:02.647687+03	\N	0.000000
d664713a-31cd-45ce-ac49-545ac8607417	3d2b476f-16a6-4788-a300-3d8254d52b65	a4d29004-edaf-4fb8-94f4-fe33c00e1afe	DEBIT	5000.000000	5000.000000	0.000000	Cost of goods sold - SALE-2026-0002	3	2026-01-02 00:50:02.647687+03	3d2b476f-16a6-4788-a300-3d8254d52b65	\N	\N	2026-01-02 00:50:02.647687+03	\N	0.000000
a3c79405-428c-4a4a-9de1-a2215025f8ae	3d2b476f-16a6-4788-a300-3d8254d52b65	261d1b86-37bd-4b9e-a99f-6599e37bc059	CREDIT	5000.000000	0.000000	5000.000000	Inventory reduction - SALE-2026-0002	4	2026-01-02 00:50:02.647687+03	3d2b476f-16a6-4788-a300-3d8254d52b65	\N	\N	2026-01-02 00:50:02.647687+03	\N	0.000000
eee00f98-3cee-4cae-8878-cb1092b6463c	d21c49fd-946f-4ab7-b90f-ecb751e25e7c	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	6500.000000	6500.000000	0.000000	Cash received from sale SALE-2026-0003	1	2026-01-02 10:05:13.329891+03	d21c49fd-946f-4ab7-b90f-ecb751e25e7c	\N	\N	2026-01-02 10:05:13.329891+03	\N	0.000000
95dcc18b-0279-4ced-b141-8b1e0d89eb31	d21c49fd-946f-4ab7-b90f-ecb751e25e7c	78c709b8-3b96-4368-ba15-ca0baa3d4867	CREDIT	6500.000000	0.000000	6500.000000	Revenue from inventory sale SALE-2026-0003	2	2026-01-02 10:05:13.329891+03	d21c49fd-946f-4ab7-b90f-ecb751e25e7c	\N	\N	2026-01-02 10:05:13.329891+03	\N	0.000000
5b8f23e0-b6d9-4a98-979e-9b689b952bfc	d21c49fd-946f-4ab7-b90f-ecb751e25e7c	a4d29004-edaf-4fb8-94f4-fe33c00e1afe	DEBIT	5000.000000	5000.000000	0.000000	Cost of goods sold - SALE-2026-0003	3	2026-01-02 10:05:13.329891+03	d21c49fd-946f-4ab7-b90f-ecb751e25e7c	\N	\N	2026-01-02 10:05:13.329891+03	\N	0.000000
1e8086f4-2067-46af-b2a7-2f89b9ad7b69	d21c49fd-946f-4ab7-b90f-ecb751e25e7c	261d1b86-37bd-4b9e-a99f-6599e37bc059	CREDIT	5000.000000	0.000000	5000.000000	Inventory reduction - SALE-2026-0003	4	2026-01-02 10:05:13.329891+03	d21c49fd-946f-4ab7-b90f-ecb751e25e7c	\N	\N	2026-01-02 10:05:13.329891+03	\N	0.000000
7f1afe7b-bce3-4fbb-a7fe-3125124dfd01	2525ebdb-5ba1-4462-998d-fc9a153c011b	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	130000.000000	130000.000000	0.000000	Cash received from sale SALE-2026-0004	1	2026-01-02 10:05:13.845336+03	2525ebdb-5ba1-4462-998d-fc9a153c011b	\N	\N	2026-01-02 10:05:13.845336+03	\N	0.000000
2bfa1b05-b388-4d05-8922-9ee99e682558	2525ebdb-5ba1-4462-998d-fc9a153c011b	78c709b8-3b96-4368-ba15-ca0baa3d4867	CREDIT	130000.000000	0.000000	130000.000000	Revenue from inventory sale SALE-2026-0004	2	2026-01-02 10:05:13.845336+03	2525ebdb-5ba1-4462-998d-fc9a153c011b	\N	\N	2026-01-02 10:05:13.845336+03	\N	0.000000
407e1a5e-515e-4e1e-b985-3cebe675dc2e	2525ebdb-5ba1-4462-998d-fc9a153c011b	a4d29004-edaf-4fb8-94f4-fe33c00e1afe	DEBIT	100000.000000	100000.000000	0.000000	Cost of goods sold - SALE-2026-0004	3	2026-01-02 10:05:13.845336+03	2525ebdb-5ba1-4462-998d-fc9a153c011b	\N	\N	2026-01-02 10:05:13.845336+03	\N	0.000000
19126d77-48f8-469f-8086-6307a442b6d6	2525ebdb-5ba1-4462-998d-fc9a153c011b	261d1b86-37bd-4b9e-a99f-6599e37bc059	CREDIT	100000.000000	0.000000	100000.000000	Inventory reduction - SALE-2026-0004	4	2026-01-02 10:05:13.845336+03	2525ebdb-5ba1-4462-998d-fc9a153c011b	\N	\N	2026-01-02 10:05:13.845336+03	\N	0.000000
d0e85c53-7c01-42c1-8a8a-b46d6a0768f8	a35b8afb-19c8-4704-8912-fc9a6ffb8a97	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	6500.000000	6500.000000	0.000000	Cash received from sale SALE-2026-0005	1	2026-01-02 10:05:14.543684+03	a35b8afb-19c8-4704-8912-fc9a6ffb8a97	\N	\N	2026-01-02 10:05:14.543684+03	\N	0.000000
b5c71f7a-781a-455a-8a90-4d12da1958e3	a35b8afb-19c8-4704-8912-fc9a6ffb8a97	78c709b8-3b96-4368-ba15-ca0baa3d4867	CREDIT	6500.000000	0.000000	6500.000000	Revenue from inventory sale SALE-2026-0005	2	2026-01-02 10:05:14.543684+03	a35b8afb-19c8-4704-8912-fc9a6ffb8a97	\N	\N	2026-01-02 10:05:14.543684+03	\N	0.000000
222df1f2-e219-4e7b-a5ca-fc84a7792da5	a35b8afb-19c8-4704-8912-fc9a6ffb8a97	a4d29004-edaf-4fb8-94f4-fe33c00e1afe	DEBIT	5000.000000	5000.000000	0.000000	Cost of goods sold - SALE-2026-0005	3	2026-01-02 10:05:14.543684+03	a35b8afb-19c8-4704-8912-fc9a6ffb8a97	\N	\N	2026-01-02 10:05:14.543684+03	\N	0.000000
46b9af10-9182-4e6b-b2df-861e1329b842	a35b8afb-19c8-4704-8912-fc9a6ffb8a97	261d1b86-37bd-4b9e-a99f-6599e37bc059	CREDIT	5000.000000	0.000000	5000.000000	Inventory reduction - SALE-2026-0005	4	2026-01-02 10:05:14.543684+03	a35b8afb-19c8-4704-8912-fc9a6ffb8a97	\N	\N	2026-01-02 10:05:14.543684+03	\N	0.000000
4a6c3442-4dff-4838-84ea-3df309ed2afb	06e1a97b-0f43-491e-9825-40fe1e4f4539	49a1be92-cac3-42df-9b88-f5dc08d12000	DEBIT	6500.000000	6500.000000	0.000000	Invoice INV-2026-0001 - matoo mataa	1	2026-01-02 10:05:14.543684+03	06e1a97b-0f43-491e-9825-40fe1e4f4539	65034fcb-8556-4124-a234-276b5b7aea3e	INVOICE	2026-01-02 10:05:14.543684+03	\N	0.000000
69f998b8-3304-40bb-9dae-95edda53432e	06e1a97b-0f43-491e-9825-40fe1e4f4539	78c709b8-3b96-4368-ba15-ca0baa3d4867	CREDIT	6500.000000	0.000000	6500.000000	Revenue - Invoice INV-2026-0001	2	2026-01-02 10:05:14.543684+03	06e1a97b-0f43-491e-9825-40fe1e4f4539	65034fcb-8556-4124-a234-276b5b7aea3e	INVOICE	2026-01-02 10:05:14.543684+03	\N	0.000000
5ea66238-f689-49f9-873a-281f95be1a8a	cdac9086-c40d-4e5a-8e3e-913cb3fdc8dc	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	500.000000	500.000000	0.000000	Cash received - RCPT-2026-0001	1	2026-01-02 10:05:14.543684+03	cdac9086-c40d-4e5a-8e3e-913cb3fdc8dc	137a172f-1657-41be-b6ef-0f696cd0fea2	INVOICE_PAYMENT	2026-01-02 10:05:14.543684+03	\N	0.000000
7d30c1bb-0b97-4a95-adfb-20641c33826d	cdac9086-c40d-4e5a-8e3e-913cb3fdc8dc	49a1be92-cac3-42df-9b88-f5dc08d12000	CREDIT	500.000000	0.000000	500.000000	AR reduced - RCPT-2026-0001	2	2026-01-02 10:05:14.543684+03	cdac9086-c40d-4e5a-8e3e-913cb3fdc8dc	137a172f-1657-41be-b6ef-0f696cd0fea2	INVOICE_PAYMENT	2026-01-02 10:05:14.543684+03	\N	0.000000
69e29676-7dad-440d-a0e7-3dd4e7144410	156df591-f8cd-4f4b-b618-5b681925712a	7553f38b-e133-4d80-b2ea-fb0053352c95	DEBIT	137000.000000	137000.000000	0.000000	Cash shortage - Session REG-2026-0001	1	2026-01-02 10:09:25.052524+03	\N	a38471c3-7f06-4d8c-925e-7d62c8740014	CASH_SESSION	2026-01-02 10:09:25.052524+03	\N	0.000000
1ce8ab00-071c-4212-a2e3-ab5119172079	156df591-f8cd-4f4b-b618-5b681925712a	a237fccc-08ee-49c9-9e80-f654bbf24846	CREDIT	137000.000000	0.000000	137000.000000	Cash shortage - Session REG-2026-0001	2	2026-01-02 10:09:25.052524+03	\N	a38471c3-7f06-4d8c-925e-7d62c8740014	CASH_SESSION	2026-01-02 10:09:25.052524+03	\N	0.000000
269fa030-9ad6-4734-9b7f-34c40deb648c	d7c0331f-5e22-4310-872c-446e863681be	9a62ebcc-c8d3-4dc1-9456-e8db6439d217	DEBIT	25000.000000	25000.000000	0.000000	Petty cash expense - Printer paper - Receipt #789	1	2026-01-02 11:01:25.088232+03	\N	2bc2f8c9-bb38-4824-922f-6d4243681327	CASH_MOVEMENT	2026-01-02 11:01:25.088232+03	\N	0.000000
00bf3f8a-4e8d-4905-9907-7359c20d21bb	d7c0331f-5e22-4310-872c-446e863681be	a237fccc-08ee-49c9-9e80-f654bbf24846	CREDIT	25000.000000	0.000000	25000.000000	Petty cash expense - Printer paper - Receipt #789	2	2026-01-02 11:01:25.088232+03	\N	2bc2f8c9-bb38-4824-922f-6d4243681327	CASH_MOVEMENT	2026-01-02 11:01:25.088232+03	\N	0.000000
12ffd02f-59d9-4499-8147-d0c3df747226	89c536a7-56c3-459e-97db-ebe248bd372c	3f20a8c9-997b-4529-83db-ce6f823f02b8	DEBIT	100000.000000	100000.000000	0.000000	Bank deposit - End of day deposit to Stanbic Bank	1	2026-01-02 11:01:53.281641+03	\N	786dbda8-135f-4399-a590-ad18c16c1f20	CASH_MOVEMENT	2026-01-02 11:01:53.281641+03	\N	0.000000
70dc20f0-1075-4954-bbe3-c00a2a04367c	89c536a7-56c3-459e-97db-ebe248bd372c	a237fccc-08ee-49c9-9e80-f654bbf24846	CREDIT	100000.000000	0.000000	100000.000000	Bank deposit - End of day deposit to Stanbic Bank	2	2026-01-02 11:01:53.281641+03	\N	786dbda8-135f-4399-a590-ad18c16c1f20	CASH_MOVEMENT	2026-01-02 11:01:53.281641+03	\N	0.000000
1e3325c5-0a64-4508-a8c5-61b3e87c26ca	4947ed6c-ecdf-4312-a042-74fc4d8f3434	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	20000.000000	20000.000000	0.000000	Float received - Session REG-2026-0002	1	2026-01-02 11:02:12.702693+03	\N	042cf2db-a496-4bb5-8a13-467fd1a9ee71	CASH_MOVEMENT	2026-01-02 11:02:12.702693+03	\N	0.000000
6174673e-e42a-4afb-9ff1-609de41bcf71	4947ed6c-ecdf-4312-a042-74fc4d8f3434	d7511a99-beb4-448e-8258-b7597a2999a7	CREDIT	20000.000000	0.000000	20000.000000	Float received - Session REG-2026-0002	2	2026-01-02 11:02:12.702693+03	\N	042cf2db-a496-4bb5-8a13-467fd1a9ee71	CASH_MOVEMENT	2026-01-02 11:02:12.702693+03	\N	0.000000
fc94d382-a094-4c3d-9af1-c0d3ec7ada02	df59637e-9314-4492-9582-4d796563929d	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	6500.000000	6500.000000	0.000000	Cash received from sale SALE-2026-0006	1	2026-01-02 11:51:36.862564+03	df59637e-9314-4492-9582-4d796563929d	\N	\N	2026-01-02 11:51:36.862564+03	\N	0.000000
5b73b90a-5c7c-4db2-b21e-ed01599314e5	df59637e-9314-4492-9582-4d796563929d	78c709b8-3b96-4368-ba15-ca0baa3d4867	CREDIT	6500.000000	0.000000	6500.000000	Revenue from inventory sale SALE-2026-0006	2	2026-01-02 11:51:36.862564+03	df59637e-9314-4492-9582-4d796563929d	\N	\N	2026-01-02 11:51:36.862564+03	\N	0.000000
acf9c64c-6fcc-4ce5-843e-9e09b845d496	df59637e-9314-4492-9582-4d796563929d	a4d29004-edaf-4fb8-94f4-fe33c00e1afe	DEBIT	5000.000000	5000.000000	0.000000	Cost of goods sold - SALE-2026-0006	3	2026-01-02 11:51:36.862564+03	df59637e-9314-4492-9582-4d796563929d	\N	\N	2026-01-02 11:51:36.862564+03	\N	0.000000
08a91376-cc51-4670-9151-793158d8b57b	df59637e-9314-4492-9582-4d796563929d	261d1b86-37bd-4b9e-a99f-6599e37bc059	CREDIT	5000.000000	0.000000	5000.000000	Inventory reduction - SALE-2026-0006	4	2026-01-02 11:51:36.862564+03	df59637e-9314-4492-9582-4d796563929d	\N	\N	2026-01-02 11:51:36.862564+03	\N	0.000000
c5c9252d-7abe-45f3-a168-e7ad526f1aaa	c5f9d162-89aa-4575-bdfc-f933af05d1bb	9a62ebcc-c8d3-4dc1-9456-e8db6439d217	DEBIT	10000.000000	10000.000000	0.000000	Expense: counting books	1	2026-01-28 09:56:42.228154+03	c5f9d162-89aa-4575-bdfc-f933af05d1bb	\N	\N	2026-01-28 09:56:42.228154+03	\N	0.000000
cc1adb12-e362-4111-8f35-3a9611a707c3	c5f9d162-89aa-4575-bdfc-f933af05d1bb	90a73ab2-54d3-4b71-9186-cf8738d69e5a	CREDIT	10000.000000	0.000000	10000.000000	Expense recognition: EXP-202601-5686	2	2026-01-28 09:56:42.228154+03	c5f9d162-89aa-4575-bdfc-f933af05d1bb	\N	\N	2026-01-28 09:56:42.228154+03	\N	0.000000
876cf844-4165-4346-a693-595739b92dbd	598a7202-7821-4ce6-9d9c-8f852019cbe3	90a73ab2-54d3-4b71-9186-cf8738d69e5a	DEBIT	10000.000000	10000.000000	0.000000	Clear AP for expense: EXP-202601-5686	1	2026-01-28 09:57:05.075706+03	598a7202-7821-4ce6-9d9c-8f852019cbe3	\N	\N	2026-01-28 09:57:05.075706+03	\N	0.000000
c08968ab-c217-46b7-88d6-329f5198a14e	598a7202-7821-4ce6-9d9c-8f852019cbe3	a237fccc-08ee-49c9-9e80-f654bbf24846	CREDIT	10000.000000	0.000000	10000.000000	Payment for expense: EXP-202601-5686	2	2026-01-28 09:57:05.075706+03	598a7202-7821-4ce6-9d9c-8f852019cbe3	\N	\N	2026-01-28 09:57:05.075706+03	\N	0.000000
19d98953-8035-4ec6-8c9b-bd0438214999	49d59781-340f-481d-86df-7e6959cf65b5	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	130000.000000	130000.000000	0.000000	Cash received from sale SALE-2026-0007	1	2026-01-28 22:57:59.55206+03	49d59781-340f-481d-86df-7e6959cf65b5	\N	\N	2026-01-28 22:57:59.55206+03	\N	0.000000
a9ae8644-b79f-4501-a63e-76e67c14a9d8	49d59781-340f-481d-86df-7e6959cf65b5	78c709b8-3b96-4368-ba15-ca0baa3d4867	CREDIT	130000.000000	0.000000	130000.000000	Revenue from inventory sale SALE-2026-0007	2	2026-01-28 22:57:59.55206+03	49d59781-340f-481d-86df-7e6959cf65b5	\N	\N	2026-01-28 22:57:59.55206+03	\N	0.000000
d9169715-5317-41a3-b1f9-69d42d3e50ca	49d59781-340f-481d-86df-7e6959cf65b5	a4d29004-edaf-4fb8-94f4-fe33c00e1afe	DEBIT	100000.000000	100000.000000	0.000000	Cost of goods sold - SALE-2026-0007	3	2026-01-28 22:57:59.55206+03	49d59781-340f-481d-86df-7e6959cf65b5	\N	\N	2026-01-28 22:57:59.55206+03	\N	0.000000
f7e1b2a0-44c1-4238-a9a9-b5fc7d09dcd5	49d59781-340f-481d-86df-7e6959cf65b5	261d1b86-37bd-4b9e-a99f-6599e37bc059	CREDIT	100000.000000	0.000000	100000.000000	Inventory reduction - SALE-2026-0007	4	2026-01-28 22:57:59.55206+03	49d59781-340f-481d-86df-7e6959cf65b5	\N	\N	2026-01-28 22:57:59.55206+03	\N	0.000000
ee38c334-ab92-444e-a841-a22ff9b5a2ed	d035c487-7f45-4058-9fc3-864a3833e513	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	6500.000000	6500.000000	0.000000	Cash received from sale SALE-2026-0008	1	2026-01-28 23:02:57.804154+03	d035c487-7f45-4058-9fc3-864a3833e513	\N	\N	2026-01-28 23:02:57.804154+03	\N	0.000000
aafb8734-b82e-482e-9f52-2066ba2d6800	d035c487-7f45-4058-9fc3-864a3833e513	78c709b8-3b96-4368-ba15-ca0baa3d4867	CREDIT	6500.000000	0.000000	6500.000000	Revenue from inventory sale SALE-2026-0008	2	2026-01-28 23:02:57.804154+03	d035c487-7f45-4058-9fc3-864a3833e513	\N	\N	2026-01-28 23:02:57.804154+03	\N	0.000000
1f3e91e3-0c2b-46c3-878b-219c96204ac3	d035c487-7f45-4058-9fc3-864a3833e513	a4d29004-edaf-4fb8-94f4-fe33c00e1afe	DEBIT	5000.000000	5000.000000	0.000000	Cost of goods sold - SALE-2026-0008	3	2026-01-28 23:02:57.804154+03	d035c487-7f45-4058-9fc3-864a3833e513	\N	\N	2026-01-28 23:02:57.804154+03	\N	0.000000
e5b0b285-88a9-43db-8884-8955b6487383	d035c487-7f45-4058-9fc3-864a3833e513	261d1b86-37bd-4b9e-a99f-6599e37bc059	CREDIT	5000.000000	0.000000	5000.000000	Inventory reduction - SALE-2026-0008	4	2026-01-28 23:02:57.804154+03	d035c487-7f45-4058-9fc3-864a3833e513	\N	\N	2026-01-28 23:02:57.804154+03	\N	0.000000
13ae8533-29bb-4eea-92f0-0730f8d1e67c	151b9aa3-6f10-49e3-9862-b668921ec47d	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	144900.000000	144900.000000	0.000000	Cash received from sale SALE-2026-0009	1	2026-01-29 09:25:26.696915+03	151b9aa3-6f10-49e3-9862-b668921ec47d	\N	\N	2026-01-29 09:25:26.696915+03	\N	0.000000
ba9f4a36-1371-474b-b77a-28b84677ed12	151b9aa3-6f10-49e3-9862-b668921ec47d	78c709b8-3b96-4368-ba15-ca0baa3d4867	CREDIT	144000.000000	0.000000	144000.000000	Revenue from inventory sale SALE-2026-0009	2	2026-01-29 09:25:26.696915+03	151b9aa3-6f10-49e3-9862-b668921ec47d	\N	\N	2026-01-29 09:25:26.696915+03	\N	0.000000
c5af5c84-a21f-4351-9665-d9a61b1fe0a1	151b9aa3-6f10-49e3-9862-b668921ec47d	a4d29004-edaf-4fb8-94f4-fe33c00e1afe	DEBIT	111000.000000	111000.000000	0.000000	Cost of goods sold - SALE-2026-0009	3	2026-01-29 09:25:26.696915+03	151b9aa3-6f10-49e3-9862-b668921ec47d	\N	\N	2026-01-29 09:25:26.696915+03	\N	0.000000
e11eface-b354-4db9-92c4-2bcd6ab6826f	151b9aa3-6f10-49e3-9862-b668921ec47d	261d1b86-37bd-4b9e-a99f-6599e37bc059	CREDIT	111000.000000	0.000000	111000.000000	Inventory reduction - SALE-2026-0009	4	2026-01-29 09:25:26.696915+03	151b9aa3-6f10-49e3-9862-b668921ec47d	\N	\N	2026-01-29 09:25:26.696915+03	\N	0.000000
2f4c37d1-e96b-43fa-8cac-10ca33f04e7d	0521b2a7-2ec0-4945-9ef8-8513914ab05a	a237fccc-08ee-49c9-9e80-f654bbf24846	DEBIT	144900.000000	144900.000000	0.000000	Cash received from sale SALE-2026-0010	1	2026-01-29 09:45:51.303928+03	0521b2a7-2ec0-4945-9ef8-8513914ab05a	\N	\N	2026-01-29 09:45:51.303928+03	\N	0.000000
7523bb05-7ad5-46d2-97ca-038def1a27dd	0521b2a7-2ec0-4945-9ef8-8513914ab05a	78c709b8-3b96-4368-ba15-ca0baa3d4867	CREDIT	144000.000000	0.000000	144000.000000	Revenue from inventory sale SALE-2026-0010	2	2026-01-29 09:45:51.303928+03	0521b2a7-2ec0-4945-9ef8-8513914ab05a	\N	\N	2026-01-29 09:45:51.303928+03	\N	0.000000
cc412cf8-4391-4ed6-ae78-419324986451	0521b2a7-2ec0-4945-9ef8-8513914ab05a	a4d29004-edaf-4fb8-94f4-fe33c00e1afe	DEBIT	111000.000000	111000.000000	0.000000	Cost of goods sold - SALE-2026-0010	3	2026-01-29 09:45:51.303928+03	0521b2a7-2ec0-4945-9ef8-8513914ab05a	\N	\N	2026-01-29 09:45:51.303928+03	\N	0.000000
23e7d210-977a-47dc-9b9d-2439e18d35d9	0521b2a7-2ec0-4945-9ef8-8513914ab05a	261d1b86-37bd-4b9e-a99f-6599e37bc059	CREDIT	111000.000000	0.000000	111000.000000	Inventory reduction - SALE-2026-0010	4	2026-01-29 09:45:51.303928+03	0521b2a7-2ec0-4945-9ef8-8513914ab05a	\N	\N	2026-01-29 09:45:51.303928+03	\N	0.000000
\.


--
-- Data for Name: manual_journal_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.manual_journal_entries (id, entry_number, entry_date, reference, narration, total_debit, total_credit, status, created_by, created_at, updated_at, reversal_notes, reversed_by_entry_id) FROM stdin;
\.


--
-- Data for Name: manual_journal_entry_lines; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.manual_journal_entry_lines (id, journal_entry_id, line_number, account_id, debit_amount, credit_amount, description, entity_type, entity_id, created_at) FROM stdin;
\.


--
-- Data for Name: payment_allocations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payment_allocations ("Id", "PaymentId", "InvoiceId", "AmountAllocated", "AllocationDate", "Notes") FROM stdin;
\.


--
-- Data for Name: payment_lines; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payment_lines (id, sale_id, payment_method, amount, reference, created_at) FROM stdin;
9c44d3cb-03b5-40b2-a4f7-0c9eaf42098e	bc3e48d7-0e22-423e-95c0-23318fcff46f	CASH	260000.00	\N	2026-01-02 00:36:23.434124+03
654de52a-664f-4fff-ad36-5345b7dbb552	623a9d1e-5c09-41bf-8f6e-21a9a48ddbc6	CASH	6500.00	\N	2026-01-02 00:50:02.647687+03
1df0ab69-8c86-439e-9bd3-505767198c7c	1204acdb-8834-4657-9f90-e1d11bb4c1fb	CASH	6500.00	\N	2026-01-02 10:05:13.329891+03
3206ccdf-7ea2-4d50-b110-d40be14ef2b4	0ff95ae6-4948-44c5-baf4-bfdab802958e	CASH	130000.00	\N	2026-01-02 10:05:13.845336+03
da9c74c8-0ece-4c82-8c44-776ff5dc0575	adad804b-bd8c-458e-89f4-a2bbd083ab60	CASH	500.00	\N	2026-01-02 10:05:14.543684+03
75b83721-48b6-4e2f-939e-a0afcf2a58cd	adad804b-bd8c-458e-89f4-a2bbd083ab60	CREDIT	6000.00	\N	2026-01-02 10:05:14.543684+03
7d923792-7052-40d1-994c-ec027a89c83b	7369e6e1-e21c-4ee1-b3e8-75b3b2b0a1bd	CASH	6500.00	\N	2026-01-02 11:51:36.862564+03
2f614351-6101-45d4-88f0-0f1021db1c93	79cc9be3-8439-4fb6-a5f0-21233b5a911f	CASH	130000.00	\N	2026-01-28 22:57:59.55206+03
db2cc4bd-dde0-4bc2-a151-baf58ca5abe4	c71211a2-7934-473f-8338-d8347f08a76b	CASH	10000.00	\N	2026-01-28 23:02:57.804154+03
6c14d7cc-8c34-4306-93e0-18074473c6d3	f8643456-3f7f-4091-a05c-ce0308a562df	CASH	150000.00	\N	2026-01-29 09:25:26.696915+03
ab391dba-1f8f-4130-95fe-5c0eee9b88cd	f957c9d4-2720-4180-8f93-3c113178975b	CASH	160000.00	\N	2026-01-29 09:45:51.303928+03
\.


--
-- Data for Name: payment_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payment_transactions (id, transaction_number, supplier_payment_id, transaction_date, payment_method, amount, reference_number, receipt_number, bank_name, transaction_id, cheque_number, notes, processed_by_id, created_at) FROM stdin;
\.


--
-- Data for Name: pos_customer_deposits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pos_customer_deposits (id, deposit_number, customer_id, amount, amount_used, amount_available, payment_method, reference, notes, status, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: pos_deposit_applications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pos_deposit_applications (id, deposit_id, sale_id, amount_applied, applied_at, applied_by) FROM stdin;
\.


--
-- Data for Name: pos_held_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pos_held_orders (id, hold_number, terminal_id, user_id, customer_id, customer_name, subtotal, tax_amount, discount_amount, total_amount, hold_reason, notes, metadata, created_at, expires_at, status, resumed_at) FROM stdin;
fdd7cb8f-ba79-4bb8-8930-2dc939f70123	HOLD-2026-0001	TERMINAL-001	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	\N	6500.0000	0.0000	0.0000	6500.0000	\N	\N	\N	2026-01-29 09:47:12.003419+03	2026-01-30 09:47:11.999+03	ACTIVE	\N
\.


--
-- Data for Name: pos_held_order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pos_held_order_items (id, hold_id, product_id, product_name, product_sku, product_type, quantity, unit_price, cost_price, subtotal, is_taxable, tax_rate, tax_amount, discount_type, discount_value, discount_amount, discount_reason, uom_id, uom_name, uom_conversion_factor, metadata, line_order) FROM stdin;
a4ac4edf-ba5a-45fc-8382-8724d576706b	fdd7cb8f-ba79-4bb8-8930-2dc939f70123	88fb682a-0d49-41f0-b57f-80a3ea8ded59	ROYCO BEEF	PRD-MHXVSIIZ-CBI8	inventory	1.0000	6500.0000	5000.0000	6500.0000	f	0.00	0.0000	\N	\N	0.0000	\N	cc8cfe19-789e-48b8-94d6-f67d1469e554	EA	\N	\N	0
\.


--
-- Data for Name: pricing_tiers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pricing_tiers (id, product_id, customer_group_id, name, pricing_formula, calculated_price, min_quantity, max_quantity, priority, valid_from, valid_until, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: processed_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.processed_events ("Id", "IdempotencyKey", "EventType", "EntityType", "EntityId", "JournalEntryId", "TransactionId", "ProcessingStatus", "ProcessedAt", "OriginalEventTimestamp", "ProcessingResult", "ErrorMessage") FROM stdin;
\.


--
-- Data for Name: product_uoms; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_uoms (id, product_id, uom_id, conversion_factor, barcode, is_default, price_override, cost_override, created_at, updated_at) FROM stdin;
d13fad40-a18e-4f8d-a222-850439d3af62	60366069-84d8-4053-a057-7d4477727caa	78bf1928-1113-4208-a688-059ca75a9b7c	24.000000	\N	f	1500.000000	800.000000	2025-11-03 20:08:38.526353+03	2025-11-03 20:08:38.526353+03
c50954f3-560d-412e-972d-654a45827e91	a12775af-de7e-4e04-b4ad-e624ee7e46a5	78bf1928-1113-4208-a688-059ca75a9b7c	24.000000	\N	f	1500.000000	1000.000000	2025-11-03 21:19:52.570877+03	2025-11-03 21:19:52.570877+03
d092e4f9-bd63-4d24-a1f6-2967fc7bfb55	b00caedc-76cb-44ed-8a31-b97441881527	78bf1928-1113-4208-a688-059ca75a9b7c	24.000000	\N	f	\N	\N	2025-11-03 22:11:03.791877+03	2025-11-03 22:11:03.791877+03
a974dcf8-d6a7-4204-8edd-1660ba1e3414	b00caedc-76cb-44ed-8a31-b97441881527	2a5e14b0-fca8-451e-8199-491de7978a4b	1.000000	\N	t	1500.000000	800.000000	2025-11-04 10:28:25.740503+03	2025-11-04 10:28:25.740503+03
043c7d8e-e9b5-41a8-9c4e-569954894972	3f655de2-1a34-4bf4-9a93-789a6b04c92d	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	t	\N	\N	2025-11-13 22:48:30.128132+03	2025-11-13 22:48:30.128132+03
192f69ff-7de5-40f0-a755-56fd4444fb50	ba2f95ae-e41f-4932-85c2-b773f950be52	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	t	\N	\N	2025-11-13 22:48:30.128132+03	2025-11-13 22:48:30.128132+03
f61d1fd1-be03-40c4-bd0a-b096dd0d92b7	8e197b21-431c-430a-b096-8541dec814ed	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	t	\N	\N	2025-11-13 22:48:30.128132+03	2025-11-13 22:48:30.128132+03
8779a06b-cf75-4ffd-8bcd-49fad8dd82bc	8b2c82ba-226e-48cf-9103-017442eec762	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	t	\N	\N	2025-11-13 22:48:30.128132+03	2025-11-13 22:48:30.128132+03
64b807af-8fa3-4f72-b06f-d9733eb70490	2b12f154-f75c-49cf-963e-b54b9482ba82	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	t	\N	\N	2025-11-13 22:48:30.128132+03	2025-11-13 22:48:30.128132+03
f4072486-ac3c-48fe-827c-17fd453acde1	a40b5928-1299-444c-9fc8-a1e843c3d05c	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	t	\N	\N	2025-11-13 22:48:30.128132+03	2025-11-13 22:48:30.128132+03
d18c16b1-2552-41d7-b4a7-ac1fe8e3ec74	088c87a4-8a80-4a7e-86ca-ca4b726334b8	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	t	\N	\N	2025-11-13 22:48:30.128132+03	2025-11-13 22:48:30.128132+03
cc8cfe19-789e-48b8-94d6-f67d1469e554	88fb682a-0d49-41f0-b57f-80a3ea8ded59	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	f	6500.000000	5000.000000	2025-11-13 23:29:51.286741+03	2025-11-13 23:29:51.286741+03
3cb97564-732a-4670-a9a4-58283835cc93	9dccbd37-e429-4e36-af98-655804f16e01	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	t	6500.000000	5000.000000	2025-11-13 23:33:31.514203+03	2025-11-13 23:33:31.514203+03
02c862f3-07da-40b5-abc8-bda3103b73cf	9dccbd37-e429-4e36-af98-655804f16e01	78bf1928-1113-4208-a688-059ca75a9b7c	12.000000	\N	f	6500.000000	5000.000000	2025-11-13 23:33:31.456251+03	2025-11-13 23:33:31.456251+03
24c5f811-1af9-4f47-ac74-d49f0c8be1a5	3988ca33-60c4-4648-8701-72c5484185ed	78bf1928-1113-4208-a688-059ca75a9b7c	12.000000	\N	f	90000.000000	72000.000000	2025-11-15 11:08:07.722477+03	2025-11-15 11:08:07.722477+03
54b39a81-7535-4353-ae5e-0315a937a115	3988ca33-60c4-4648-8701-72c5484185ed	5e1a17fa-49a7-486e-9096-24f8d386ae02	1.000000	\N	f	7500.000000	6000.000000	2025-11-15 11:08:07.645327+03	2025-11-15 11:08:07.645327+03
f3e38dcf-4e28-42d1-ac3c-6f5cfcac28db	b096a24b-e65f-4031-bf7d-1d4c26f46eea	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	t	\N	\N	2025-11-13 22:48:30.128132+03	2025-11-13 22:48:30.128132+03
415fe0ab-0c31-49bb-9178-5ef63470a158	488435a4-5239-418e-aa6b-1de89a9650a9	78bf1928-1113-4208-a688-059ca75a9b7c	24.000000	\N	f	120000.000000	78000.000000	2025-12-28 11:29:17.131641+03	2025-12-28 11:29:17.131641+03
5a0ca040-9d09-4e8e-90d1-321de73ce534	488435a4-5239-418e-aa6b-1de89a9650a9	2a5e14b0-fca8-451e-8199-491de7978a4b	1.000000	\N	t	\N	\N	2025-12-28 11:29:17.139068+03	2025-12-28 11:29:17.139068+03
5f5d181e-6415-48a4-972c-422932a0920d	07276487-80eb-4c25-9d28-dced576c00ce	2a5e14b0-fca8-451e-8199-491de7978a4b	1.000000	\N	t	\N	\N	2025-11-15 13:02:19.126048+03	2025-11-15 13:02:19.126048+03
18a0f54d-1d1c-4e2a-8cf6-aea48e594d9a	5853e365-49e6-4bba-bfa9-cb1e73c422a8	12935c09-c15f-44e9-bc2f-dbf7cf73c43b	24.000000	\N	f	\N	\N	2025-11-13 22:48:30.128132+03	2025-11-13 22:48:30.128132+03
2e1b0252-af1c-463e-8f95-0c95bac09243	5853e365-49e6-4bba-bfa9-cb1e73c422a8	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	t	7000.000000	5000.000000	2025-12-28 11:43:40.052123+03	2025-12-28 11:43:40.052123+03
a70e0032-5b78-4d8e-bb2a-1477fb723c1f	8879d9f3-52db-4c4f-8331-e29787bce8d5	b51b8119-a0b9-4886-b61f-f5d680a67c54	1.000000	\N	t	130000.000000	100000.000000	2025-12-28 12:07:40.659043+03	2025-12-28 12:07:40.659043+03
27b3f001-311a-4fc7-9492-7f8e346fabc1	0d282dcb-2e3f-48dc-872e-bf8507557ebb	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	1.000000	\N	t	7500.000000	6000.000000	2025-11-04 11:57:07.217303+03	2025-11-04 11:57:07.217303+03
b4ddffb8-9dbd-42ae-b9ae-81725cba25da	0d282dcb-2e3f-48dc-872e-bf8507557ebb	78bf1928-1113-4208-a688-059ca75a9b7c	12.000000	\N	f	7500.000000	6000.000000	2025-11-04 11:57:07.163728+03	2025-11-04 11:57:07.163728+03
7d7949da-94a6-4343-8b92-652281cabec1	285eb071-5f03-4494-80dc-020fe16ffec3	f9c13a3e-7c00-4d5f-9147-55158753c00d	12.000000	\N	f	1500.000000	1000.000000	2025-11-15 12:35:58.34067+03	2025-11-15 12:35:58.34067+03
1d6d7751-bd61-4d38-8b50-f62d9e441e2b	285eb071-5f03-4494-80dc-020fe16ffec3	2a5e14b0-fca8-451e-8199-491de7978a4b	1.000000	\N	t	1500.000000	1000.000000	2025-11-15 12:35:58.231258+03	2025-11-15 12:35:58.231258+03
55e5340f-2d59-404f-8e7a-c70c22a503db	e01bf28f-26a3-4ec8-af60-a77b8e1f36b9	78bf1928-1113-4208-a688-059ca75a9b7c	24.000000	\N	f	\N	\N	2025-11-04 00:19:00.113019+03	2025-11-04 00:19:00.113019+03
09ff6b96-1230-413a-8e51-b9ee5f1c1788	e01bf28f-26a3-4ec8-af60-a77b8e1f36b9	c2411e44-71fd-42f1-bac7-0cb054dfc2ad	1.000000	\N	t	6500.000000	5500.000000	2025-11-04 10:18:15.199558+03	2025-11-04 10:18:15.199558+03
42b9efe1-79e5-4caa-ac6a-6bdbf6dfe0f7	07276487-80eb-4c25-9d28-dced576c00ce	f9c13a3e-7c00-4d5f-9147-55158753c00d	12.000000	\N	f	18000.000000	12000.000000	2025-11-15 13:02:19.01112+03	2025-11-15 13:02:19.01112+03
\.


--
-- Data for Name: quotations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quotations (id, quote_number, quote_type, customer_id, customer_name, customer_phone, customer_email, reference, description, subtotal, discount_amount, tax_amount, total_amount, status, valid_from, valid_until, converted_to_sale_id, converted_to_invoice_id, converted_at, created_by_id, assigned_to_id, terms_and_conditions, payment_terms, delivery_terms, internal_notes, rejection_reason, requires_approval, approved_by_id, approved_at, parent_quote_id, revision_number, created_at, updated_at) FROM stdin;
0ff5842f-0514-4cff-8e3f-d5909339c137	Q-2026-0001	standard	bd0743b8-8438-412b-84ac-10cc02ae9553	becca becca	+25675424500	Nsam12345@gmail.com	\N	\N	24500.00	0.00	0.00	24500.00	ACCEPTED	2026-01-28	2026-02-27	\N	\N	\N	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	\N	Net 30	7-14 business days	\N	\N	f	\N	\N	\N	1	2026-01-28 22:40:05.770887+03	2026-01-28 22:45:52.790976+03
39dd3be8-295e-4ffc-919b-204075f0a20f	Q-2026-0002	quick	\N	matoo mataa	0754220747	\N	\N	Quick quote from POS	7500.00	0.00	900.00	8400.00	DRAFT	2026-01-29	2026-02-28	\N	\N	\N	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	1	2026-01-29 09:47:50.480018+03	2026-01-29 09:47:50.480018+03
64b1470d-0ec1-4e88-ad0a-12d49f093c8c	Q-2026-0003	quick	\N	matoo mataa	0754220747	\N	\N	Quick quote from POS	7500.00	0.00	900.00	8400.00	SENT	2026-01-29	2026-02-28	\N	\N	\N	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	1	2026-01-29 09:48:12.225457+03	2026-01-29 09:48:57.484301+03
\.


--
-- Data for Name: quotation_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quotation_attachments (id, quotation_id, file_name, file_path, file_size, mime_type, description, uploaded_by_id, uploaded_at) FROM stdin;
\.


--
-- Data for Name: quotation_emails; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quotation_emails (id, quotation_id, recipient_email, recipient_name, subject, body, status, error_message, opened_at, sent_by_id, sent_at) FROM stdin;
\.


--
-- Data for Name: quotation_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quotation_items (id, quotation_id, line_number, product_id, item_type, sku, description, notes, quantity, unit_price, discount_amount, subtotal, is_taxable, tax_rate, tax_amount, line_total, uom_id, uom_name, unit_cost, cost_total, product_type, created_at) FROM stdin;
c17b1bcf-3980-4ce1-aa08-73fac517f9b3	0ff5842f-0514-4cff-8e3f-d5909339c137	1	3988ca33-60c4-4648-8701-72c5484185ed	product	PRD-MHZZZWOT-I44Z	Blue Band 500g	\N	1.0000	7500.00	0.00	7500.00	f	18.00	0.00	7500.00	\N	\N	\N	\N	inventory	2026-01-28 22:45:38.718176+03
faa463aa-54e2-4085-bcc2-4d886e09c47d	0ff5842f-0514-4cff-8e3f-d5909339c137	2	88fb682a-0d49-41f0-b57f-80a3ea8ded59	product	PRD-MHXVSIIZ-CBI8	ROYCO BEEF	\N	2.0000	6500.00	0.00	13000.00	f	18.00	0.00	13000.00	\N	\N	\N	\N	inventory	2026-01-28 22:45:38.718176+03
abc2177e-c6f4-4b8d-981f-f584789039ec	0ff5842f-0514-4cff-8e3f-d5909339c137	3	2b12f154-f75c-49cf-963e-b54b9482ba82	product	PRD-MHXR149U-ZOCH	MANGO JUICE	\N	2.0000	2000.00	0.00	4000.00	f	18.00	0.00	4000.00	\N	\N	\N	\N	inventory	2026-01-28 22:45:38.718176+03
ed358b21-fb16-466b-9842-5ec47cf49a12	39dd3be8-295e-4ffc-919b-204075f0a20f	1	3988ca33-60c4-4648-8701-72c5484185ed	product	PRD-MHZZZWOT-I44Z	Blue Band 500g	\N	1.0000	7500.00	0.00	7500.00	t	12.00	900.00	8400.00	54b39a81-7535-4353-ae5e-0315a937a115	TN	\N	\N	inventory	2026-01-29 09:47:50.480018+03
8b81be40-9e74-465e-9229-9c4d587ae280	64b1470d-0ec1-4e88-ad0a-12d49f093c8c	1	3988ca33-60c4-4648-8701-72c5484185ed	product	PRD-MHZZZWOT-I44Z	Blue Band 500g	\N	1.0000	7500.00	0.00	7500.00	t	12.00	900.00	8400.00	54b39a81-7535-4353-ae5e-0315a937a115	TN	\N	\N	inventory	2026-01-29 09:48:12.225457+03
\.


--
-- Data for Name: quotation_status_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quotation_status_history (id, quotation_id, from_status, to_status, notes, changed_by_id, changed_at, ip_address, user_agent) FROM stdin;
a1f79324-fd6a-4447-b108-72b0d98898df	0ff5842f-0514-4cff-8e3f-d5909339c137	DRAFT	ACCEPTED	Status changed from DRAFT to ACCEPTED	\N	2026-01-28 22:40:55.460724+03	\N	\N
15335a88-df8c-479e-9288-0d76758c838b	0ff5842f-0514-4cff-8e3f-d5909339c137	ACCEPTED	DRAFT	Status changed from ACCEPTED to DRAFT	\N	2026-01-28 22:42:45.51356+03	\N	\N
8bbb082b-2100-426f-bd83-a59883f23a85	0ff5842f-0514-4cff-8e3f-d5909339c137	DRAFT	ACCEPTED	Status changed from DRAFT to ACCEPTED	\N	2026-01-28 22:45:52.790976+03	\N	\N
caa698a7-7356-4294-a8c9-d2efe834833d	64b1470d-0ec1-4e88-ad0a-12d49f093c8c	DRAFT	SENT	Status changed from DRAFT to SENT	\N	2026-01-29 09:48:57.484301+03	\N	\N
\.


--
-- Data for Name: rbac_audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rbac_audit_logs (id, actor_user_id, target_user_id, target_role_id, action, previous_state, new_state, ip_address, user_agent, "timestamp") FROM stdin;
4869e6ac-64c4-4cef-bd75-12fa6ad6c790	00000000-0000-0000-0000-000000000001	\N	1ad1f629-2177-4684-8289-520a0d0939b0	role_created	\N	{"name": "Test Sales Rep", "description": "Test role for sales representatives", "permissions": ["sales.read", "sales.create", "customers.read", "pos.read", "pos.create"]}	\N	\N	2026-01-02 21:19:04.171638+03
20d92f12-1064-499e-a6b2-cd77401f0669	00000000-0000-0000-0000-000000000001	\N	1ad1f629-2177-4684-8289-520a0d0939b0	role_deleted	{"name": "Test Sales Rep", "isActive": true}	{"name": "Test Sales Rep", "isActive": false}	\N	\N	2026-01-02 21:19:04.188919+03
c25260ba-4a86-44af-befa-e256aed2adeb	00000000-0000-0000-0000-000000000001	\N	1dc61bd3-1b5c-450f-aaee-3ff86b76e7cb	role_created	\N	{"name": "Test Sales Rep 1767378273124", "description": "Test role for sales representatives", "permissions": ["sales.read", "sales.create", "customers.read", "pos.read", "pos.create"]}	\N	\N	2026-01-02 21:24:33.126348+03
c513bfb6-9b3c-4f5d-9b8e-bd75363aa368	00000000-0000-0000-0000-000000000001	\N	1dc61bd3-1b5c-450f-aaee-3ff86b76e7cb	role_updated	{"name": "Test Sales Rep 1767378273124", "version": 1, "description": "Test role for sales representatives"}	{"name": "Test Sales Rep 1767378273124", "version": 2, "description": "Updated test role description"}	\N	\N	2026-01-02 21:24:33.137131+03
8db97c64-4584-4130-b837-59d2df21b6ba	00000000-0000-0000-0000-000000000001	\N	1dc61bd3-1b5c-450f-aaee-3ff86b76e7cb	role_deleted	{"name": "Test Sales Rep 1767378273124", "isActive": true}	{"name": "Test Sales Rep 1767378273124", "isActive": false}	\N	\N	2026-01-02 21:24:33.145231+03
f5c7f76d-0ab9-4c50-8570-c7f286aca24d	7aa55a55-db98-4a9d-a743-d877c7d8dd21	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 21:37:14.845415+03
3dda139b-ff13-4caf-beba-a59d86e92ac4	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	731dcdd5-3228-43dc-b008-fa92f01a847a	role_created	\N	{"name": "Inventory Supervisor", "description": "Can manage inventory operations", "permissions": ["inventory.read", "inventory.create", "inventory.update", "inventory.approve"]}	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 21:40:13.79458+03
10998998-eb37-4a10-a460-b0a91589f01f	7aa55a55-db98-4a9d-a743-d877c7d8dd21	87510c1b-2872-400e-8e2e-40a62853a843	731dcdd5-3228-43dc-b008-fa92f01a847a	user_role_assigned	\N	{"roleId": "731dcdd5-3228-43dc-b008-fa92f01a847a", "roleName": "Inventory Supervisor"}	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 21:41:02.068011+03
84e04e96-017a-4400-bc6f-c3a3f77e6551	7aa55a55-db98-4a9d-a743-d877c7d8dd21	87510c1b-2872-400e-8e2e-40a62853a843	731dcdd5-3228-43dc-b008-fa92f01a847a	user_role_removed	{"roleId": "731dcdd5-3228-43dc-b008-fa92f01a847a", "roleName": "Inventory Supervisor"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 21:41:22.484931+03
85e38b84-3c12-4f18-a6fd-8bc7aec1c7ac	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	731dcdd5-3228-43dc-b008-fa92f01a847a	role_permissions_updated	{"permissions": ["inventory.approve", "inventory.create", "inventory.read", "inventory.update"]}	{"permissions": ["inventory.read", "inventory.create", "inventory.update", "inventory.approve", "inventory.delete", "inventory.export"]}	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 21:41:36.634551+03
c7407596-207c-4810-b77c-ad70f5293bd3	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	731dcdd5-3228-43dc-b008-fa92f01a847a	role_updated	{"name": "Inventory Supervisor", "version": 1, "description": "Can manage inventory operations"}	{"name": "Inventory Manager", "version": 2, "description": "Full inventory management with delete"}	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 21:41:36.634551+03
d5ffac8d-1dfc-4d64-9318-bc892f3ccf41	00000000-0000-0000-0000-000000000001	\N	c3f12230-62ce-4cf7-9595-31fa7c8b6200	role_created	\N	{"name": "Test Sales Rep 1767381012047", "description": "Test role for sales representatives", "permissions": ["sales.read", "sales.create", "customers.read", "pos.read", "pos.create"]}	\N	\N	2026-01-02 22:10:12.049788+03
694986c2-46c7-41b0-9bc6-aa582a0f30a8	00000000-0000-0000-0000-000000000001	\N	c3f12230-62ce-4cf7-9595-31fa7c8b6200	role_updated	{"name": "Test Sales Rep 1767381012047", "version": 1, "description": "Test role for sales representatives"}	{"name": "Test Sales Rep 1767381012047", "version": 2, "description": "Updated test role description"}	\N	\N	2026-01-02 22:10:12.061691+03
bc99c446-966e-4906-8d30-b53b2d24ea30	00000000-0000-0000-0000-000000000001	\N	c3f12230-62ce-4cf7-9595-31fa7c8b6200	role_deleted	{"name": "Test Sales Rep 1767381012047", "isActive": true}	{"name": "Test Sales Rep 1767381012047", "isActive": false}	\N	\N	2026-01-02 22:10:12.069516+03
bb4679bb-c299-42fd-b885-410bf0e91dc3	00000000-0000-0000-0000-000000000001	\N	c234cdc7-e119-400c-965c-d926a810517b	role_created	\N	{"name": "Test Sales Rep 1767381016473", "description": "Test role for sales representatives", "permissions": ["sales.read", "sales.create", "customers.read", "pos.read", "pos.create"]}	\N	\N	2026-01-02 22:10:16.476536+03
f9c4d012-fcbb-4050-9743-b4a9d86d9d3e	00000000-0000-0000-0000-000000000001	\N	c234cdc7-e119-400c-965c-d926a810517b	role_updated	{"name": "Test Sales Rep 1767381016473", "version": 1, "description": "Test role for sales representatives"}	{"name": "Test Sales Rep 1767381016473", "version": 2, "description": "Updated test role description"}	\N	\N	2026-01-02 22:10:16.487088+03
503d915d-7037-45ac-8b60-2398cf2bb8ce	00000000-0000-0000-0000-000000000001	\N	c234cdc7-e119-400c-965c-d926a810517b	role_deleted	{"name": "Test Sales Rep 1767381016473", "isActive": true}	{"name": "Test Sales Rep 1767381016473", "isActive": false}	\N	\N	2026-01-02 22:10:16.495249+03
46e07352-50cd-4351-b4af-84923145de75	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:25:10.056629+03
c0a08558-636c-49af-a0fb-41cbce730008	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:25:11.083043+03
34522b54-1db2-4b77-957e-cd3408db922c	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:25:20.972395+03
b035a94c-4dc0-4c59-a007-07d6c7328a51	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:25:20.981885+03
62a7eae2-5690-4500-b90d-6ed14f666dc2	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:25:22.018786+03
4b59b329-95bc-4167-bcc2-ef520c880b84	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:25:22.322609+03
2dff572a-bdac-435b-b1c9-be2e94185537	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:26:01.389475+03
b96824ba-e093-470c-8038-a30278defc58	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:26:01.389969+03
dd3e4c6c-bb60-429d-a9f4-7f7e6d04e487	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:26:02.426558+03
4552e6af-9b84-42a3-81a3-a5a03d935d2e	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:26:02.732017+03
4a98da8b-e778-4509-9ff2-0e3c28d9a72a	00000000-0000-0000-0000-000000000001	\N	a48f3928-c6b1-4f15-b438-eb4c2905184c	role_created	\N	{"name": "Test Sales Rep 1767381993211", "description": "Test role for sales representatives", "permissions": ["sales.read", "sales.create", "customers.read", "pos.read", "pos.create"]}	\N	\N	2026-01-02 22:26:33.214563+03
0015a81c-1e5a-4b29-8748-caa945d788c4	00000000-0000-0000-0000-000000000001	\N	a48f3928-c6b1-4f15-b438-eb4c2905184c	role_updated	{"name": "Test Sales Rep 1767381993211", "version": 1, "description": "Test role for sales representatives"}	{"name": "Test Sales Rep 1767381993211", "version": 2, "description": "Updated test role description"}	\N	\N	2026-01-02 22:26:33.23377+03
ef7e3a1c-4f59-46f5-a277-672f2a3c2bda	00000000-0000-0000-0000-000000000001	\N	a48f3928-c6b1-4f15-b438-eb4c2905184c	role_deleted	{"name": "Test Sales Rep 1767381993211", "isActive": true}	{"name": "Test Sales Rep 1767381993211", "isActive": false}	\N	\N	2026-01-02 22:26:33.243169+03
2873c5c2-a856-4293-b1a2-88a5cab6f965	00000000-0000-0000-0000-000000000001	\N	8c83e1bd-75d3-496c-ade3-0aa3ddb4037a	role_created	\N	{"name": "Test Sales Rep 1767381994699", "description": "Test role for sales representatives", "permissions": ["sales.read", "sales.create", "customers.read", "pos.read", "pos.create"]}	\N	\N	2026-01-02 22:26:34.701478+03
ffb941bc-2b60-405a-a05d-00517c90e2f5	00000000-0000-0000-0000-000000000001	\N	8c83e1bd-75d3-496c-ade3-0aa3ddb4037a	role_updated	{"name": "Test Sales Rep 1767381994699", "version": 1, "description": "Test role for sales representatives"}	{"name": "Test Sales Rep 1767381994699", "version": 2, "description": "Updated test role description"}	\N	\N	2026-01-02 22:26:34.713771+03
f60b2f03-2bed-4c9a-8d31-dbc82308af44	00000000-0000-0000-0000-000000000001	\N	8c83e1bd-75d3-496c-ade3-0aa3ddb4037a	role_deleted	{"name": "Test Sales Rep 1767381994699", "isActive": true}	{"name": "Test Sales Rep 1767381994699", "isActive": false}	\N	\N	2026-01-02 22:26:34.721336+03
90d443e6-eff9-4f5a-b1f3-c4e9db566592	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	3f2ce05a-a143-4b02-aea0-70a3c9b60e01	role_created	\N	{"name": "Test API Role 126074080", "description": "Testing via API", "permissions": ["sales.read", "sales.create", "customers.read"]}	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 22:27:09.207174+03
21ad8e3e-20f9-4032-9842-e640a2065de2	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	3f2ce05a-a143-4b02-aea0-70a3c9b60e01	role_permissions_updated	{"permissions": ["customers.read", "sales.create", "sales.read"]}	{"permissions": ["sales.read", "sales.create", "sales.update", "customers.read"]}	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 22:27:09.236082+03
2186f2ff-48e6-44ec-b0cf-dc5cfb0ff688	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	3f2ce05a-a143-4b02-aea0-70a3c9b60e01	role_updated	{"name": "Test API Role 126074080", "version": 1, "description": "Testing via API"}	{"name": "Test API Role 126074080", "version": 2, "description": "Updated description"}	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 22:27:09.236082+03
38cf2553-01ba-4573-9232-c4b15d0ac116	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	3f2ce05a-a143-4b02-aea0-70a3c9b60e01	role_deleted	{"name": "Test API Role 126074080", "isActive": true}	{"name": "Test API Role 126074080", "isActive": false}	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 22:27:09.252678+03
b6fcc698-8c91-4e68-beec-b57d33839f02	7aa55a55-db98-4a9d-a743-d877c7d8dd21	87510c1b-2872-400e-8e2e-40a62853a843	db408de1-9cae-4c1f-a516-de302876a910	user_role_assigned	\N	{"roleId": "db408de1-9cae-4c1f-a516-de302876a910", "roleName": "Manager"}	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 22:27:42.656704+03
7d09443f-ed88-4f62-83dc-1a1f96bb3d76	7aa55a55-db98-4a9d-a743-d877c7d8dd21	87510c1b-2872-400e-8e2e-40a62853a843	db408de1-9cae-4c1f-a516-de302876a910	user_role_removed	{"roleId": "db408de1-9cae-4c1f-a516-de302876a910", "roleName": "Manager"}	\N	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	2026-01-02 22:27:42.695301+03
c0f72785-929c-44ec-be37-3d5747db1e77	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:33:44.066153+03
4b976049-c3d0-4b28-a98c-895cf3812e25	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:33:44.101337+03
2a4ac416-cb0b-44cb-b317-8c517ec4b9c6	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:33:45.39644+03
c1fe34bd-9880-4b3a-85f7-1faecca6bd95	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:33:45.424702+03
f8a8551c-cd29-400e-a6e3-349c5c32ff4d	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:34:31.682563+03
cde9988a-495c-47c7-8144-2ea37b75a220	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:34:31.685363+03
f2d7daa1-4ba5-4752-9a56-13c5fdeac563	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:34:58.090261+03
f7af12a6-268f-4330-a98d-8d647edcee21	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:34:58.090486+03
37cddd55-2807-41e4-8f88-05a90947e044	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:35:06.659055+03
6ed66a83-7ee8-42d4-9aa2-6de4f01b01ac	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:35:07.72249+03
3f7552c6-6874-43bb-a45b-1de2cc15507a	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:35:10.039222+03
e79213e3-ecaa-4c03-b71e-1008dfa2aaee	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:35:10.040092+03
b4ff87a4-27ee-485d-8192-cf9da5645c68	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:35:11.092985+03
51a29b19-ee08-4acb-b2db-3d6de4791daa	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:35:11.093464+03
841c534a-28fa-4d92-85b5-f2ee0d2c1631	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:35:17.552378+03
db0d1934-0fb7-4c49-9ad7-0e1f8634eeb3	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:35:17.552611+03
3f1946bf-c2bb-444d-a2ac-4cc643f4f019	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:35:18.601402+03
0391a477-b609-405a-a832-cc2239737802	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:35:18.629965+03
91fbb240-6af5-4cef-b4a0-f0b74e07c746	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:44.021696+03
6293de48-9d51-47c6-9d00-1a32075d3c8e	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:45.044965+03
5fe61365-91af-43e4-972a-d00e104bb7c0	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:45.221117+03
61006e89-8f60-4629-b751-35f05934dc09	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:45.535416+03
a07146f1-77fa-44b1-9f15-a59fbf1ceda3	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:46.551867+03
9c462efc-5ddf-45f3-9cf3-d27d6f942e88	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:46.83001+03
0054d399-8c85-482d-a921-802cefb1698a	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:49.271048+03
fc3c61cc-4674-4873-8030-6603146dbb23	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:49.598746+03
798cdd07-0801-4ed7-8a22-0a6310e8b622	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:50.616585+03
87ac2e3c-22d4-44a9-87e4-e2531f1098b5	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:50.848579+03
172c6723-5b02-4008-8823-2324bdc006ed	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:55.672287+03
e8a0a579-25fd-4983-b206-123dc12e8b14	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:55.997407+03
b7269f3b-b70c-4769-a907-268cdf71837f	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:57.012002+03
e2ea157b-0519-489e-8e99-2f5a5a19f3c7	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:36:57.278313+03
f94f3ebc-e937-497e-874a-670abeb873ff	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:47:34.188513+03
317d1464-74f1-4ae1-9396-08fc332e9ef4	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:47:34.188685+03
6059feae-f9d8-47fc-a73d-993ecc6cba95	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:47:35.207965+03
ad6a553f-6d11-4a1b-9628-9fe7c02f401f	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:47:35.208836+03
60b2aa0f-2251-402a-9185-ce1dcf5e5ccb	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:47:43.788793+03
89fbe926-6df3-4d5d-a54a-28e881e38244	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:47:43.789551+03
4b0691dd-970b-4558-bf95-637ecad1695f	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:47:43.798199+03
8ff35808-a309-4f0a-9a08-4b6ff7e27b87	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:47:43.798806+03
45c82161-0a5c-450a-a6d3-13e9a63d9eb8	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:52:21.690714+03
5020cb10-368b-44e3-aca6-405c7e6ede3b	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:52:21.736951+03
e8ba6fe5-4eca-482e-8afd-71e87b931f85	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:52:22.730544+03
b1a02393-2a1a-4c7f-a4af-f6c034e01c2d	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 22:52:22.759638+03
af5d8803-6103-4110-82ef-6deb013420c9	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:03.54796+03
2a4902df-b972-4313-aa0f-851e65a9062b	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:03.549526+03
ab03081d-87c5-42da-ba26-cac722ca9f30	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:04.566715+03
240ec40b-fda0-41c4-9d74-a3976629773e	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:04.566929+03
614973b2-1009-467a-bb13-ed45e2c89cdc	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:30.214113+03
adf0c597-4bc5-4eb2-ada7-702edfd4bc97	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:30.214243+03
e3d2d1a7-6f29-46f1-a152-5d28d5437c2f	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:30.223181+03
c8557827-793f-4f46-a821-4d388769e824	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:30.223302+03
74343c38-7fd1-41ab-b115-684d71dac601	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:34.886072+03
9572ed5f-abcc-4ce9-86ed-91d3ea28ac38	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:34.886196+03
b3548c31-efc1-453b-b318-329c81458624	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:34.893633+03
7a3c23f5-dbe9-4b13-871b-00a9fc15403d	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:01:34.893747+03
31cf31fe-8462-4882-b1ce-05c8bfe34202	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:03:08.857738+03
5b1bd748-2e53-4288-be70-d0f46250576e	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:03:08.871181+03
d2c2dd25-8187-498d-8960-335eb0120270	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:03:09.892135+03
79147e89-70ea-4a64-81f7-745b826ee019	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:03:09.906178+03
5305fbaf-4360-4b4a-b776-65980497ef45	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:06:40.633901+03
8d135bb1-4fb9-4a24-b688-90ac00f610d3	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:06:40.748642+03
31456d78-ecbd-4899-a361-9bfd48564d22	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:06:41.662194+03
a89ca708-9c0e-4227-bac9-3604bbc87d71	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:06:41.769477+03
bbac25c6-63f6-418b-9b19-21e5633476ed	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:11:25.505869+03
6e6d989c-89ca-434b-bfe4-91e74c85fc05	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:11:25.505564+03
56a7d7dd-e2a4-4bf5-912a-fdb80fffc767	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:11:26.536954+03
525f5c0c-05b0-4d9d-937d-5be12de2ddef	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:11:26.539496+03
54a73d70-a5d0-499c-85ec-bb72c57d5c1e	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:04.917682+03
5f1ace92-81a9-4c29-9366-50187b20d8a8	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:04.959177+03
5e866f07-39ee-48c2-a874-39d23f23b5ed	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:05.954962+03
66428e1c-6837-4220-a41a-23f332bed5db	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:06.308392+03
fdcb3704-44af-43a4-a19c-d27a8918cfae	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:19.448473+03
f6f42df0-8685-4375-b56e-add480c50596	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:19.448586+03
61c00b48-e18f-4cfd-852a-5a88eb9d0908	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:19.457883+03
ff57cacc-edc0-433f-a9d1-fe5f0d6a327f	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.users_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:19.458084+03
dec48f2c-fa48-4b6e-9575-ef3ccbd17dfa	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:25.470664+03
7139a7d2-9766-4326-9c0b-ea1f55c31849	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:25.471342+03
46257065-6190-40b2-96c9-4dd07d540810	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:26.495556+03
f6c78463-8d1f-4583-874c-315b0cdd1916	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:12:26.495776+03
dd802605-cab0-41f3-8143-fa78d352c955	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:18:10.331478+03
553a3fdb-2d69-4da3-bbdf-48885b9b4ec3	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:18:10.33274+03
94949188-c6ae-49e3-ae25-12d8e30787a9	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:18:11.661685+03
6f01a757-b406-4764-80d9-b136bde21ad6	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:18:11.661793+03
ee8cccb1-5b69-4c11-a39b-2db6a91f2a95	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:19:19.213929+03
63fda767-5ad3-4834-b87e-a3dcdb054d77	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:19:19.250993+03
48b4150e-9ab9-44af-bddb-c747ad90c94d	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:19:20.248719+03
82f26e51-a783-4fc9-a458-eb0e734a5da8	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:19:20.575519+03
bf6099e4-94e5-4690-861a-0a2e1cd6d1fe	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:21:01.680765+03
f177b7a6-b151-46f8-b7e1-828eaae734dd	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:21:01.789525+03
a2832e50-5cfe-4152-a132-7cf876cc95f8	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:21:02.701617+03
2cec5cb8-e548-450a-80d7-efd2b7a2bc42	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:21:02.844811+03
07b782ea-022f-42ad-b5d7-41ab5ed1e797	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:27:15.448306+03
8c3cab47-c25b-44b4-9df5-ce247cdb0c4d	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:27:15.454871+03
1af1001f-7f16-4e66-8906-76b42ec70852	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:27:16.481082+03
d0eb2148-1af3-4f2d-af0b-3d148a1417d8	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:27:16.481477+03
954537ec-ad8c-4d8c-831c-eca9b3055f5b	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:28:18.148706+03
61ceebab-0817-4e01-9c82-9cafbd7f2474	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:28:18.152558+03
938976af-9ffc-49d2-be89-d895805deffc	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:28:19.17816+03
43810868-2975-4758-ad27-28f95c3bc70c	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:28:19.178451+03
c8d39270-255e-47d3-ae20-2f69e4a98bc3	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:29:22.605716+03
35986c7f-bc04-4952-b642-2d4fe168e092	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:29:22.92046+03
100da5f4-4449-4e3a-96ff-abe5b076c744	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:29:23.949228+03
7312dbc8-4167-47ce-8f10-0e54614ea658	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:29:24.200029+03
6f002654-ef27-46d7-8c1d-a018a3026b7a	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:45:56.447963+03
c587ac39-6444-4d98-af65-e65ab850510b	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:45:56.512072+03
4f539896-88fb-4bba-bd46-608e9706263e	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:45:57.508962+03
ce3dade2-d6d2-4e82-94d7-7b24f0c5434f	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:45:57.534747+03
7f5a7bfd-22b0-481d-a3fc-ec7990664152	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:50:45.532755+03
d3027408-ee78-4976-bda8-4e8c2acbb70e	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:50:45.543741+03
62bf84cb-50a9-4a2f-831b-17e41ad56a30	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:50:46.595466+03
a68a992b-da8f-4ffe-9b9e-f854f1fec810	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:50:46.59652+03
4e93e5eb-724f-4be0-ad3a-a37ac7041441	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:51:12.608184+03
f5d6fe20-6432-460b-bafb-d2c317e6da20	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:51:12.608813+03
d721ffe8-3d26-496e-a295-d10c201ff1a5	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.roles_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:51:13.971106+03
3cbbb88e-469c-4e77-bfe2-ddf2df0cd5a4	956f87a9-18cf-49ee-94b4-9c44a94a7faf	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	permission_denied	\N	{"denied": true, "permissionKey": "system.permissions_read"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	2026-01-02 23:51:13.972522+03
\.


--
-- Data for Name: rbac_permissions_catalog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rbac_permissions_catalog (key, module, action, description, created_at) FROM stdin;
sales.read	sales	read	View sales transactions	2026-01-02 21:17:47.67741+03
sales.create	sales	create	Create new sales	2026-01-02 21:17:47.67741+03
sales.update	sales	update	Modify existing sales	2026-01-02 21:17:47.67741+03
sales.delete	sales	delete	Delete sales transactions	2026-01-02 21:17:47.67741+03
sales.void	sales	void	Void completed sales	2026-01-02 21:17:47.67741+03
sales.export	sales	export	Export sales data	2026-01-02 21:17:47.67741+03
sales.approve	sales	approve	Approve sales requiring authorization	2026-01-02 21:17:47.67741+03
inventory.read	inventory	read	View inventory levels	2026-01-02 21:17:47.67741+03
inventory.create	inventory	create	Create inventory items	2026-01-02 21:17:47.67741+03
inventory.update	inventory	update	Modify inventory items	2026-01-02 21:17:47.67741+03
inventory.delete	inventory	delete	Delete inventory items	2026-01-02 21:17:47.67741+03
inventory.import	inventory	import	Import inventory data	2026-01-02 21:17:47.67741+03
inventory.export	inventory	export	Export inventory data	2026-01-02 21:17:47.67741+03
inventory.approve	inventory	approve	Approve stock adjustments	2026-01-02 21:17:47.67741+03
pos.read	pos	read	Access point of sale	2026-01-02 21:17:47.67741+03
pos.create	pos	create	Process transactions	2026-01-02 21:17:47.67741+03
pos.void	pos	void	Void POS transactions	2026-01-02 21:17:47.67741+03
pos.approve	pos	approve	Approve POS overrides	2026-01-02 21:17:47.67741+03
purchasing.read	purchasing	read	View purchase orders	2026-01-02 21:17:47.67741+03
purchasing.create	purchasing	create	Create purchase orders	2026-01-02 21:17:47.67741+03
purchasing.update	purchasing	update	Modify purchase orders	2026-01-02 21:17:47.67741+03
purchasing.delete	purchasing	delete	Delete purchase orders	2026-01-02 21:17:47.67741+03
purchasing.approve	purchasing	approve	Approve purchase orders	2026-01-02 21:17:47.67741+03
purchasing.post	purchasing	post	Post goods receipts	2026-01-02 21:17:47.67741+03
customers.read	customers	read	View customers	2026-01-02 21:17:47.67741+03
customers.create	customers	create	Create customers	2026-01-02 21:17:47.67741+03
customers.update	customers	update	Modify customers	2026-01-02 21:17:47.67741+03
customers.delete	customers	delete	Delete customers	2026-01-02 21:17:47.67741+03
customers.export	customers	export	Export customer data	2026-01-02 21:17:47.67741+03
suppliers.read	suppliers	read	View suppliers	2026-01-02 21:17:47.67741+03
suppliers.create	suppliers	create	Create suppliers	2026-01-02 21:17:47.67741+03
suppliers.update	suppliers	update	Modify suppliers	2026-01-02 21:17:47.67741+03
suppliers.delete	suppliers	delete	Delete suppliers	2026-01-02 21:17:47.67741+03
accounting.read	accounting	read	View accounting data	2026-01-02 21:17:47.67741+03
accounting.create	accounting	create	Create journal entries	2026-01-02 21:17:47.67741+03
accounting.update	accounting	update	Modify accounting records	2026-01-02 21:17:47.67741+03
accounting.delete	accounting	delete	Delete accounting records	2026-01-02 21:17:47.67741+03
accounting.post	accounting	post	Post journal entries	2026-01-02 21:17:47.67741+03
accounting.approve	accounting	approve	Approve accounting transactions	2026-01-02 21:17:47.67741+03
accounting.void	accounting	void	Void posted entries	2026-01-02 21:17:47.67741+03
accounting.export	accounting	export	Export accounting data	2026-01-02 21:17:47.67741+03
reports.read	reports	read	View reports	2026-01-02 21:17:47.67741+03
reports.create	reports	create	Create custom reports	2026-01-02 21:17:47.67741+03
reports.export	reports	export	Export reports	2026-01-02 21:17:47.67741+03
admin.read	admin	read	View admin panel	2026-01-02 21:17:47.67741+03
admin.create	admin	create	Create admin resources	2026-01-02 21:17:47.67741+03
admin.update	admin	update	Modify admin settings	2026-01-02 21:17:47.67741+03
admin.delete	admin	delete	Delete admin resources	2026-01-02 21:17:47.67741+03
system.read	system	read	View system configuration	2026-01-02 21:17:47.67741+03
system.update	system	update	Modify system settings	2026-01-02 21:17:47.67741+03
system.audit_read	system	read	View audit logs	2026-01-02 21:17:47.67741+03
system.users_read	system	read	View users	2026-01-02 21:17:47.67741+03
system.users_create	system	create	Create users	2026-01-02 21:17:47.67741+03
system.users_update	system	update	Modify users	2026-01-02 21:17:47.67741+03
system.users_delete	system	delete	Delete users	2026-01-02 21:17:47.67741+03
system.roles_read	system	read	View roles	2026-01-02 21:17:47.67741+03
system.roles_create	system	create	Create roles	2026-01-02 21:17:47.67741+03
system.roles_update	system	update	Modify roles	2026-01-02 21:17:47.67741+03
system.roles_delete	system	delete	Delete roles	2026-01-02 21:17:47.67741+03
system.permissions_read	system	read	View permissions catalog	2026-01-02 21:17:47.67741+03
\.


--
-- Data for Name: rbac_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rbac_roles (id, name, description, version, is_system_role, is_active, created_at, updated_at, created_by, updated_by) FROM stdin;
2a0e3607-81a4-478a-bef9-5fc64e782caf	Super Administrator	Full system access - all permissions	1	t	t	2026-01-02 21:17:47.67741+03	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	Administrator	Administrative access - user and role management	1	t	t	2026-01-02 21:17:47.67741+03	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	Manager	Operational management - sales, inventory, purchasing	1	t	t	2026-01-02 21:17:47.67741+03	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001	00000000-0000-0000-0000-000000000001
54797b30-3b1a-4255-a0e0-c786e671eb1f	Cashier	Point of sale operations	1	t	t	2026-01-02 21:17:47.67741+03	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	Auditor	Read-only access for auditing purposes	1	t	t	2026-01-02 21:17:47.67741+03	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001	00000000-0000-0000-0000-000000000001
1dc61bd3-1b5c-450f-aaee-3ff86b76e7cb	Test Sales Rep 1767378273124	Updated test role description	3	f	f	2026-01-02 21:24:33.126348+03	2026-01-02 21:24:33.145231+03	00000000-0000-0000-0000-000000000001	00000000-0000-0000-0000-000000000001
731dcdd5-3228-43dc-b008-fa92f01a847a	Inventory Manager	Full inventory management with delete	2	f	t	2026-01-02 21:40:13.79458+03	2026-01-02 21:41:36.634551+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21	7aa55a55-db98-4a9d-a743-d877c7d8dd21
c3f12230-62ce-4cf7-9595-31fa7c8b6200	Test Sales Rep 1767381012047	Updated test role description	3	f	f	2026-01-02 22:10:12.049788+03	2026-01-02 22:10:12.069516+03	00000000-0000-0000-0000-000000000001	00000000-0000-0000-0000-000000000001
c234cdc7-e119-400c-965c-d926a810517b	Test Sales Rep 1767381016473	Updated test role description	3	f	f	2026-01-02 22:10:16.476536+03	2026-01-02 22:10:16.495249+03	00000000-0000-0000-0000-000000000001	00000000-0000-0000-0000-000000000001
a48f3928-c6b1-4f15-b438-eb4c2905184c	Test Sales Rep 1767381993211	Updated test role description	3	f	f	2026-01-02 22:26:33.214563+03	2026-01-02 22:26:33.243169+03	00000000-0000-0000-0000-000000000001	00000000-0000-0000-0000-000000000001
8c83e1bd-75d3-496c-ade3-0aa3ddb4037a	Test Sales Rep 1767381994699	Updated test role description	3	f	f	2026-01-02 22:26:34.701478+03	2026-01-02 22:26:34.721336+03	00000000-0000-0000-0000-000000000001	00000000-0000-0000-0000-000000000001
3f2ce05a-a143-4b02-aea0-70a3c9b60e01	Test API Role 126074080	Updated description	3	f	f	2026-01-02 22:27:09.207174+03	2026-01-02 22:27:09.252678+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21	7aa55a55-db98-4a9d-a743-d877c7d8dd21
\.


--
-- Data for Name: rbac_role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rbac_role_permissions (role_id, permission_key, granted_at, granted_by) FROM stdin;
2a0e3607-81a4-478a-bef9-5fc64e782caf	sales.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	sales.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	sales.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	sales.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	sales.void	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	sales.export	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	sales.approve	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	inventory.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	inventory.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	inventory.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	inventory.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	inventory.import	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	inventory.export	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	inventory.approve	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	pos.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	pos.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	pos.void	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	pos.approve	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	purchasing.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	purchasing.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	purchasing.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	purchasing.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	purchasing.approve	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	purchasing.post	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	customers.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	customers.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	customers.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	customers.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	customers.export	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	suppliers.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	suppliers.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	suppliers.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	suppliers.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	accounting.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	accounting.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	accounting.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	accounting.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	accounting.post	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	accounting.approve	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	accounting.void	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	accounting.export	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	reports.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	reports.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	reports.export	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	admin.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	admin.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	admin.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	admin.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.audit_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.users_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.users_create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.users_update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.users_delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.roles_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.roles_create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.roles_update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.roles_delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
2a0e3607-81a4-478a-bef9-5fc64e782caf	system.permissions_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	sales.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	inventory.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	pos.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	purchasing.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	customers.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	suppliers.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	accounting.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	reports.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	reports.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	reports.export	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	admin.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	admin.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	admin.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	admin.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.audit_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.users_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.users_create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.users_update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.users_delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.roles_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.roles_create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.roles_update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.roles_delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
d8aed65e-49ff-4b56-9077-06a1f411b638	system.permissions_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	sales.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	sales.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	sales.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	sales.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	sales.void	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	sales.export	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	sales.approve	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	inventory.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	inventory.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	inventory.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	inventory.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	inventory.import	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	inventory.export	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	inventory.approve	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	pos.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	pos.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	pos.void	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	pos.approve	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	purchasing.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	purchasing.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	purchasing.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	purchasing.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	purchasing.approve	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	purchasing.post	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	customers.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	customers.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	customers.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	customers.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	customers.export	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	suppliers.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	suppliers.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	suppliers.update	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	suppliers.delete	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	reports.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	reports.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
db408de1-9cae-4c1f-a516-de302876a910	reports.export	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
54797b30-3b1a-4255-a0e0-c786e671eb1f	sales.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
54797b30-3b1a-4255-a0e0-c786e671eb1f	sales.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
54797b30-3b1a-4255-a0e0-c786e671eb1f	inventory.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
54797b30-3b1a-4255-a0e0-c786e671eb1f	pos.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
54797b30-3b1a-4255-a0e0-c786e671eb1f	pos.create	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
54797b30-3b1a-4255-a0e0-c786e671eb1f	customers.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	sales.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	inventory.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	pos.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	purchasing.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	customers.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	suppliers.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	accounting.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	reports.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	admin.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	system.read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	system.audit_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	system.users_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	system.roles_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
5a4c1a33-3c0f-47fd-a27d-d431c1c10bd2	system.permissions_read	2026-01-02 21:17:47.67741+03	00000000-0000-0000-0000-000000000001
1dc61bd3-1b5c-450f-aaee-3ff86b76e7cb	sales.read	2026-01-02 21:24:33.126348+03	00000000-0000-0000-0000-000000000001
1dc61bd3-1b5c-450f-aaee-3ff86b76e7cb	sales.create	2026-01-02 21:24:33.126348+03	00000000-0000-0000-0000-000000000001
1dc61bd3-1b5c-450f-aaee-3ff86b76e7cb	customers.read	2026-01-02 21:24:33.126348+03	00000000-0000-0000-0000-000000000001
1dc61bd3-1b5c-450f-aaee-3ff86b76e7cb	pos.read	2026-01-02 21:24:33.126348+03	00000000-0000-0000-0000-000000000001
1dc61bd3-1b5c-450f-aaee-3ff86b76e7cb	pos.create	2026-01-02 21:24:33.126348+03	00000000-0000-0000-0000-000000000001
731dcdd5-3228-43dc-b008-fa92f01a847a	inventory.read	2026-01-02 21:41:36.634551+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21
731dcdd5-3228-43dc-b008-fa92f01a847a	inventory.create	2026-01-02 21:41:36.634551+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21
731dcdd5-3228-43dc-b008-fa92f01a847a	inventory.update	2026-01-02 21:41:36.634551+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21
731dcdd5-3228-43dc-b008-fa92f01a847a	inventory.approve	2026-01-02 21:41:36.634551+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21
731dcdd5-3228-43dc-b008-fa92f01a847a	inventory.delete	2026-01-02 21:41:36.634551+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21
731dcdd5-3228-43dc-b008-fa92f01a847a	inventory.export	2026-01-02 21:41:36.634551+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21
c3f12230-62ce-4cf7-9595-31fa7c8b6200	sales.read	2026-01-02 22:10:12.049788+03	00000000-0000-0000-0000-000000000001
c3f12230-62ce-4cf7-9595-31fa7c8b6200	sales.create	2026-01-02 22:10:12.049788+03	00000000-0000-0000-0000-000000000001
c3f12230-62ce-4cf7-9595-31fa7c8b6200	customers.read	2026-01-02 22:10:12.049788+03	00000000-0000-0000-0000-000000000001
c3f12230-62ce-4cf7-9595-31fa7c8b6200	pos.read	2026-01-02 22:10:12.049788+03	00000000-0000-0000-0000-000000000001
c3f12230-62ce-4cf7-9595-31fa7c8b6200	pos.create	2026-01-02 22:10:12.049788+03	00000000-0000-0000-0000-000000000001
c234cdc7-e119-400c-965c-d926a810517b	sales.read	2026-01-02 22:10:16.476536+03	00000000-0000-0000-0000-000000000001
c234cdc7-e119-400c-965c-d926a810517b	sales.create	2026-01-02 22:10:16.476536+03	00000000-0000-0000-0000-000000000001
c234cdc7-e119-400c-965c-d926a810517b	customers.read	2026-01-02 22:10:16.476536+03	00000000-0000-0000-0000-000000000001
c234cdc7-e119-400c-965c-d926a810517b	pos.read	2026-01-02 22:10:16.476536+03	00000000-0000-0000-0000-000000000001
c234cdc7-e119-400c-965c-d926a810517b	pos.create	2026-01-02 22:10:16.476536+03	00000000-0000-0000-0000-000000000001
a48f3928-c6b1-4f15-b438-eb4c2905184c	sales.read	2026-01-02 22:26:33.214563+03	00000000-0000-0000-0000-000000000001
a48f3928-c6b1-4f15-b438-eb4c2905184c	sales.create	2026-01-02 22:26:33.214563+03	00000000-0000-0000-0000-000000000001
a48f3928-c6b1-4f15-b438-eb4c2905184c	customers.read	2026-01-02 22:26:33.214563+03	00000000-0000-0000-0000-000000000001
a48f3928-c6b1-4f15-b438-eb4c2905184c	pos.read	2026-01-02 22:26:33.214563+03	00000000-0000-0000-0000-000000000001
a48f3928-c6b1-4f15-b438-eb4c2905184c	pos.create	2026-01-02 22:26:33.214563+03	00000000-0000-0000-0000-000000000001
8c83e1bd-75d3-496c-ade3-0aa3ddb4037a	sales.read	2026-01-02 22:26:34.701478+03	00000000-0000-0000-0000-000000000001
8c83e1bd-75d3-496c-ade3-0aa3ddb4037a	sales.create	2026-01-02 22:26:34.701478+03	00000000-0000-0000-0000-000000000001
8c83e1bd-75d3-496c-ade3-0aa3ddb4037a	customers.read	2026-01-02 22:26:34.701478+03	00000000-0000-0000-0000-000000000001
8c83e1bd-75d3-496c-ade3-0aa3ddb4037a	pos.read	2026-01-02 22:26:34.701478+03	00000000-0000-0000-0000-000000000001
8c83e1bd-75d3-496c-ade3-0aa3ddb4037a	pos.create	2026-01-02 22:26:34.701478+03	00000000-0000-0000-0000-000000000001
3f2ce05a-a143-4b02-aea0-70a3c9b60e01	sales.read	2026-01-02 22:27:09.236082+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21
3f2ce05a-a143-4b02-aea0-70a3c9b60e01	sales.create	2026-01-02 22:27:09.236082+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21
3f2ce05a-a143-4b02-aea0-70a3c9b60e01	sales.update	2026-01-02 22:27:09.236082+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21
3f2ce05a-a143-4b02-aea0-70a3c9b60e01	customers.read	2026-01-02 22:27:09.236082+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21
\.


--
-- Data for Name: rbac_user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rbac_user_roles (id, user_id, role_id, scope_type, scope_id, assigned_at, assigned_by, expires_at, is_active) FROM stdin;
206c17cb-ac1c-4459-b90c-22bffbf49b64	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2a0e3607-81a4-478a-bef9-5fc64e782caf	\N	\N	2026-01-02 21:38:09.505829+03	00000000-0000-0000-0000-000000000001	\N	t
3b46ac25-db13-44c8-b44f-48e43bf21cc3	87510c1b-2872-400e-8e2e-40a62853a843	731dcdd5-3228-43dc-b008-fa92f01a847a	\N	\N	2026-01-02 21:41:02.068011+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	f
66990eea-031f-44c1-a47b-38c48bcdbf8d	87510c1b-2872-400e-8e2e-40a62853a843	db408de1-9cae-4c1f-a516-de302876a910	\N	\N	2026-01-02 22:27:42.656704+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	f
b9a6bb3b-47ce-492f-a540-25d750d320d6	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2a0e3607-81a4-478a-bef9-5fc64e782caf	\N	\N	2026-01-02 23:52:41.228896+03	7aa55a55-db98-4a9d-a743-d877c7d8dd21	\N	t
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.refresh_tokens (id, user_id, token_hash, family_id, expires_at, is_revoked, created_at, rotated_at, device_info, ip_address) FROM stdin;
10f8bf06-344a-49a6-b30e-1bb1c28e67ab	1cb55ec4-7188-45bb-a8fc-75369181cb21	979408a5d1e2119031d4b15ba8181238ea6f304d7406f47898ffd5da36c4b739	aed56bf4-a278-4e24-9b03-54d64708ad9b	2026-01-31 18:30:00.069+03	t	2026-01-01 18:30:00.070357+03	2026-01-01 18:35:18.149946+03	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
5940829a-d100-40c1-b756-21b5e6f3bab4	1cb55ec4-7188-45bb-a8fc-75369181cb21	0c936e7cc20534110cc61d30cef359a98eb6b9179dcdac64bf8c23891da4ec4f	aed56bf4-a278-4e24-9b03-54d64708ad9b	2026-01-31 18:35:18.152+03	t	2026-01-01 18:35:18.153271+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
bbf39e70-5e9c-4b9c-a2d8-92f02bd5f0b5	956f87a9-18cf-49ee-94b4-9c44a94a7faf	9874477628eedc6628d0aa2fb95914d6f3fdc8ca6d625c523298537170c6f8de	18ff54f4-e892-474b-b65b-fc721f273189	2026-01-31 19:04:07.488+03	f	2026-01-01 19:04:07.489171+03	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	::1
c94860d1-b9cf-4a9d-b66f-b51c89ea312e	956f87a9-18cf-49ee-94b4-9c44a94a7faf	6b6ad3619335842e571bb726b1d15d293a973b78662629e4264e798ed78a2ed0	a9b0bb9a-776b-4d82-8f75-e0adca4996bb	2026-01-31 19:15:35.057+03	f	2026-01-01 19:15:35.058817+03	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	::1
6ee61226-ff7f-4b1e-b5c9-f3348815d0ef	928aa439-3efd-4efc-8238-239fb97996bc	d3ed25c00dae741f501600adad20dbd24089381567fff8ece6933e5a2ec3afa7	df004fd9-bd68-4918-9e0d-a7fb5ce4a34b	2026-01-31 21:16:06.852+03	f	2026-01-01 21:16:06.853503+03	\N	node	::1
fca8b04e-5130-4106-b710-3c25b38aa4bd	928aa439-3efd-4efc-8238-239fb97996bc	7f3b8dfd90055308fabc81234e551b03bd3187e98d47aef33eaac4dfd8f49dff	5bda7fed-2822-4698-8447-c6d3d3267c65	2026-01-31 21:18:39.204+03	f	2026-01-01 21:18:39.20549+03	\N	node	::1
919cb09d-88f2-4bf0-b4bc-fc75dfea6cab	928aa439-3efd-4efc-8238-239fb97996bc	a9d2ec03e7bfd2809adbdd6da524e84f095b8a012983fd159df16480588ade3c	339fef45-7bf0-487e-890f-fcbfd26fa446	2026-01-31 21:19:09.812+03	f	2026-01-01 21:19:09.813045+03	\N	node	::1
c87d3d93-5202-406a-af6c-8c28dccb8079	928aa439-3efd-4efc-8238-239fb97996bc	2906aaf81e8972d992c19ee8f77a08fbc7a3a131e914f67beb4db6e4808108d4	e93cbd88-923a-47f3-ad48-e88c277d04c8	2026-01-31 21:22:13.671+03	f	2026-01-01 21:22:13.672437+03	\N	node	::1
a8124805-f037-4eb5-835e-9d39aeb0f6f4	928aa439-3efd-4efc-8238-239fb97996bc	667cd21fd70c7117fa1d4a5c05cee2eedf5613a6b2238ce24191713d81ffc7e8	256158d3-b0cc-4a7e-8bf2-06956f314f14	2026-01-31 21:40:53.691+03	f	2026-01-01 21:40:53.692063+03	\N	node	::1
1610af00-cf3f-41c5-a808-72b310bd6ed4	7aa55a55-db98-4a9d-a743-d877c7d8dd21	edab6ccb81b6c0cce93ebec5c33062d001f575914cd2706f4b10a5d5a3e53d3c	7cf87937-55e2-4db0-af72-0588812ac842	2026-01-31 22:23:24.786+03	f	2026-01-01 22:23:24.787748+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
17e0ff8b-b21e-4766-9561-441fe59c7a05	7aa55a55-db98-4a9d-a743-d877c7d8dd21	ea7c9372eba46cbef4df00a3e55dc320667b3c13f7533d1eb18e4f2d4b6e5ba2	2f416383-2d4a-4542-83f2-64fd9b927805	2026-01-31 22:27:27.853+03	f	2026-01-01 22:27:27.853469+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
d9980c03-88c8-4108-87b6-b1cd123ab124	7aa55a55-db98-4a9d-a743-d877c7d8dd21	5f73e9ad0ae7302683d427e16aefa3b2352f89d98dd1e1d758a365a2433ac4f8	4ee48458-d439-4f3d-babc-43c73f01722a	2026-01-31 22:27:34.549+03	f	2026-01-01 22:27:34.549741+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
f89a5e4f-cf29-4653-b3a6-877087c450b9	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2a6fc917011939aabc4829c6faffa4aafbcf43f6b4280842b04e58b92493cbd6	b932491f-96ed-4a0b-8b60-bb64cbf34556	2026-02-01 00:15:24.777+03	f	2026-01-02 00:15:24.778117+03	\N	axios/1.13.2	::1
ff873fb8-5948-4a3e-bbd7-e993065c23a3	7aa55a55-db98-4a9d-a743-d877c7d8dd21	02f2eeeac31135889adf27f025feda06237c8e9bee9f7c2791225579c6b62128	d1faf04f-fe34-46c1-bad0-1c4b2ffd36c8	2026-02-01 10:09:24.83+03	f	2026-01-02 10:09:24.830917+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
a84ffb54-f5c5-43a7-a580-538213f8f1d1	7aa55a55-db98-4a9d-a743-d877c7d8dd21	adda86c9a925a88ed96d191686af0e7a6014e43c2ccac7e78eec4f74dd11a282	a697d057-8329-4644-bbfb-38b59a47a65d	2026-02-01 10:52:18.817+03	f	2026-01-02 10:52:18.817745+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
1c64cd4d-aa64-453c-8019-3d59a8034650	7aa55a55-db98-4a9d-a743-d877c7d8dd21	f6f607326d90e7564e885e4b10a502889bad937879535bbd132c4bd55f221755	99f2797e-502f-438c-a881-36cafb684e70	2026-02-01 10:52:29.428+03	f	2026-01-02 10:52:29.429099+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
05d00f78-9997-4ee4-b0bc-217811bfc882	7aa55a55-db98-4a9d-a743-d877c7d8dd21	6018fd326e854d0a0e2fd9f241e592f3d00f6fab1edaaddd5b0919a2f77dd271	3354d03c-ba79-48a2-9ac1-bcb947e9e51b	2026-02-01 10:52:59.404+03	f	2026-01-02 10:52:59.40437+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
fee1ddbb-6676-49ef-800a-fe624b2ff5ca	7aa55a55-db98-4a9d-a743-d877c7d8dd21	0de4cd2d3615ea02b0f8c8280f555e5817d33375e4d87ed47d1b3fe26649e28f	98124633-e0ac-4d5f-b497-d5aa85fc7c6b	2026-02-01 10:53:10.291+03	f	2026-01-02 10:53:10.292128+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
cdef72b0-accd-4659-a04e-1418ee943aa3	7aa55a55-db98-4a9d-a743-d877c7d8dd21	6318c52739d82506f66fb15f1d2142212428e417fdb0fe2af7c6cd57986836b5	e5c66945-841c-4980-81a5-34e0ccc275a8	2026-02-01 10:53:19.085+03	f	2026-01-02 10:53:19.085961+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
14a132a2-ba22-45bd-aa92-8540caedf658	7aa55a55-db98-4a9d-a743-d877c7d8dd21	9dfb17400afdc034e47c4ffc9ca86092222491fc2026d4b6901029b020dd7025	dfa472d9-45a8-457a-a23d-6d9fa91cf48f	2026-02-01 10:54:52.546+03	f	2026-01-02 10:54:52.547068+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
cb56d309-b31a-47b4-9f6e-165367770a59	7aa55a55-db98-4a9d-a743-d877c7d8dd21	c859dcc0213e897fc8b3a2518f21821c97537f50781a1ba98a2d0098605cb735	1e7bdc41-9e2e-40df-9e55-8f66aa3e4d77	2026-02-01 10:54:59.814+03	f	2026-01-02 10:54:59.815335+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
4d5a9855-0e94-44b1-9de8-031ff291cc17	7aa55a55-db98-4a9d-a743-d877c7d8dd21	85c2a446e4cb643f7d1f9b72350f540cac8f7e288a008b49a62f318066ec135c	d0847e50-cfbe-4055-91ca-b806b0e976dd	2026-02-01 11:01:25.029+03	f	2026-01-02 11:01:25.030676+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
01aa8bf9-8ea9-46f8-bbb8-c0b7b7c89342	7aa55a55-db98-4a9d-a743-d877c7d8dd21	68c8b095572865f524519e1d31cc7d0c778801785fac4501f85abb10fb734e56	42dcca3b-f9e0-45fc-8e10-1302381e7013	2026-02-01 11:01:53.264+03	f	2026-01-02 11:01:53.265827+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
89cda23e-0759-4636-aec6-309590f6c885	7aa55a55-db98-4a9d-a743-d877c7d8dd21	b21f8451aceb9b55cc61de94ac6455d329dbe4c3e4bb7bb7269170f936252f5c	5d11cfef-1949-4e9c-ba04-41aa1610050d	2026-02-01 11:02:12.691+03	f	2026-01-02 11:02:12.692116+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
f45c4533-a119-4e55-8c8b-7f2fe9d322ad	7aa55a55-db98-4a9d-a743-d877c7d8dd21	3b23fbc45f3280ea37bcaec67eea5c82b3ac036a268359e830237c70155e5843	8b4b569c-14b0-4dec-bc1f-a6c199087ff2	2026-02-01 11:09:35.018+03	f	2026-01-02 11:09:35.018966+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
236673b0-b497-4e11-9d01-66a9d3f5a52f	7aa55a55-db98-4a9d-a743-d877c7d8dd21	d70281b0a9b6424d860b439e841a2cd0087febef67d5ea2fd1e8f2491a995be0	94e77ee7-52a3-4144-be76-4149ba05d4de	2026-02-01 11:12:30.226+03	f	2026-01-02 11:12:30.227678+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
018b0d6e-df2f-4136-a4f4-9acedca2f181	7aa55a55-db98-4a9d-a743-d877c7d8dd21	a8abcfef4343b6cd38e8fb31ffffe4d6441556a50b429d760a341f3dd6181f9c	fc7ff445-896e-408f-b2cc-256673c1642c	2026-02-01 11:12:45.75+03	f	2026-01-02 11:12:45.750948+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
83d7247f-1d98-49d7-8e1c-4b2644983542	7aa55a55-db98-4a9d-a743-d877c7d8dd21	4ff639bf11668625d58371548b379b3928254ebea58a2e11c6eb938e2811f41e	35e9166c-b5a6-49ac-be43-7f12dc754dea	2026-02-01 11:13:50.261+03	f	2026-01-02 11:13:50.262499+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
24cf6105-f6eb-4287-965c-4bbe998bac7c	7aa55a55-db98-4a9d-a743-d877c7d8dd21	09c20deab3c234e216fa169a242b30ee21dcf48c719884e6c5e4043d5dc64d32	54657ebe-878f-4966-bd74-96b44d598747	2026-02-01 11:13:59.286+03	f	2026-01-02 11:13:59.28748+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
34216106-8b1c-4474-aa5c-847bd8087b4e	7aa55a55-db98-4a9d-a743-d877c7d8dd21	42021043572a11c8f910a15c3c7782fc855b6d93bec2d16a789188b32d05b2d7	4444de61-afa4-4a08-ad67-aa1834a16efd	2026-02-01 11:14:26.438+03	f	2026-01-02 11:14:26.438725+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
83ae549a-ee06-460b-a728-bc656a17f4a8	7aa55a55-db98-4a9d-a743-d877c7d8dd21	923fdd1766a7bfe7367474cca9fcd66dc08003f4af432d45e77bfa57b5ca70e8	78558556-ea15-47a1-9205-d286d749d8d7	2026-02-01 11:15:57.787+03	f	2026-01-02 11:15:57.788667+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
ac8bc061-506b-4bbc-aacd-a6e90baf42d7	7aa55a55-db98-4a9d-a743-d877c7d8dd21	f88e8aea5a53d321b66c300ed4508ba51c5122f1abdee8fb2d55ed6387a9c2f1	44118d87-cb1f-42af-8e31-82fe2d211093	2026-02-01 11:20:01.772+03	f	2026-01-02 11:20:01.773932+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
71d444e0-ceb6-4b36-906e-84d2df1fdbf9	7aa55a55-db98-4a9d-a743-d877c7d8dd21	8c9b584716c1bb2d10d7b73c03cf270f8c7ccfab21f5105ea2c6b956f18c36c2	70a769c2-851f-4301-bb8e-0176a808bce8	2026-02-01 11:23:01.32+03	f	2026-01-02 11:23:01.320605+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
3a1a7a17-7582-4bef-900c-c897e6742d81	7aa55a55-db98-4a9d-a743-d877c7d8dd21	7f3cffd341b9cf0332b922d7feda42fcad69d6846103ab41972f24b2f6770447	61719f87-a85a-4ff5-935d-545fb3b1b2bb	2026-02-01 11:35:07.796+03	f	2026-01-02 11:35:07.797589+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
0ba57abc-0969-4cb2-a6c0-06880916fbdd	7aa55a55-db98-4a9d-a743-d877c7d8dd21	f14bf3f0f6a1e4c5a019323fc54ab06009c08485cccc2abe391597f08e1fdcff	1eb791ec-e3b4-4cbd-9bb0-20842285a786	2026-02-01 11:35:15.395+03	f	2026-01-02 11:35:15.39652+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
817ea640-5203-43c6-b5b6-3f801e497a44	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2a1b668ddd8151203c09fe23cdcb72c5fb9e904bc2a373a200c1ed9e43d23802	152a5b38-3d65-40f7-9600-ec4ba01f2858	2026-02-01 11:37:51.83+03	f	2026-01-02 11:37:51.832147+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
59a29bda-cfda-43ad-a560-250d1bf17b84	7aa55a55-db98-4a9d-a743-d877c7d8dd21	e4cfd8540300620a1aa435298b1f8a975a0f2dd155a38b4cb4870ecd627c7eff	76bef5b6-e480-4244-9c58-6c2c9e8b2494	2026-02-01 11:38:46.174+03	f	2026-01-02 11:38:46.175289+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
2be7b455-2876-42ad-a853-07b3da646118	7aa55a55-db98-4a9d-a743-d877c7d8dd21	7b5816fb18b93fe4904beb1a121acec951ceab004079b0fa1bacb6070ac93fad	c942c730-d543-4f72-9e11-6234b60103a0	2026-02-01 11:38:59.558+03	f	2026-01-02 11:38:59.559131+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
fb040249-6084-462d-92d2-42478422c759	7aa55a55-db98-4a9d-a743-d877c7d8dd21	9d37a5aa4418a2f55656795afb64a38bf0d9ade600a6934927ae8ae292f73bae	7eca1584-8fa1-4160-878e-9c076e063777	2026-02-01 11:39:07.323+03	f	2026-01-02 11:39:07.32405+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
a348e920-da24-4133-88a1-130768ee62bf	7aa55a55-db98-4a9d-a743-d877c7d8dd21	4cd0ced8eb54f737d1179848fd514e28c4cfabab2965214836978593eed10839	1b7ed9f4-c9b8-4de7-93b8-57c907623687	2026-02-01 11:40:34.238+03	f	2026-01-02 11:40:34.239479+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
b7b0894d-0dfd-4f5f-86d3-41e3e47b06db	7aa55a55-db98-4a9d-a743-d877c7d8dd21	564f6e26c7188292c8bfaf69b425d9c9975841c707b2fe68dc185b1106356b06	d20cf218-e9fc-4439-a726-35d01a91b96f	2026-02-01 11:41:11.92+03	f	2026-01-02 11:41:11.921793+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
ddbbeee6-7178-4b64-9af2-4bb429914e26	7aa55a55-db98-4a9d-a743-d877c7d8dd21	3ea0b0fdaf88dac6a31565fc84ebb3cb5c51e4269a9a167d3b139295baf592f6	09777598-912e-44d1-b56c-98854a3503c5	2026-02-01 11:45:53.16+03	f	2026-01-02 11:45:53.161866+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
c6e53bdf-6779-4960-88c1-2f42fec494ec	7aa55a55-db98-4a9d-a743-d877c7d8dd21	591d208ea62c70ffbbcec95bb6ff3d90779f917997825357c762d72aeaf2ba7e	d1c2c330-b5ce-42a6-8362-b720d2778e63	2026-02-01 11:48:40.287+03	f	2026-01-02 11:48:40.288282+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
008d9fc7-e416-40ae-8308-4c6d2e3a0b4a	7aa55a55-db98-4a9d-a743-d877c7d8dd21	9c74ab096fab61eba66b5162206a1ee0ebf7dc7e2df7ad1ba1a89cfa79f59595	7cdacd83-980f-4e85-8d5c-1b457b711a98	2026-02-01 11:49:02.67+03	f	2026-01-02 11:49:02.670608+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
8f901fb9-0b6a-4f29-8f15-0b07d3cee467	7aa55a55-db98-4a9d-a743-d877c7d8dd21	7a8e8cb484de293b31c8903e68cfcabbf154503da831bb901b810703eae08cb9	876a4e11-4f83-4e99-94d9-36daae39d64c	2026-02-01 11:56:51.583+03	f	2026-01-02 11:56:51.583973+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
43ad2855-2fc9-4fea-bb47-bb0a0fa586dd	7aa55a55-db98-4a9d-a743-d877c7d8dd21	334b0f9b0eadf35c1bfd50bffdee943f95f520d567b7a740361b9f616343a4e4	6b4882f5-b731-4931-97b4-c62d03fe17be	2026-02-01 11:57:02.933+03	f	2026-01-02 11:57:02.934303+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
d47c4354-d952-4562-88ee-50a17b77bda1	7aa55a55-db98-4a9d-a743-d877c7d8dd21	e8575248e36dc347e2472caf61da293eef476ac429a42749bb11b02dc4ebb65b	65a75fef-df22-4c17-a821-018603684b8d	2026-02-01 11:57:11.736+03	f	2026-01-02 11:57:11.737513+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
58420ca8-5360-4039-b577-408832021bb2	7aa55a55-db98-4a9d-a743-d877c7d8dd21	42d76693c03fb32dbd69135b0901c0fe1914f8cd8b5b733631dfd725188268bf	2d164fe2-d0d5-40db-bfe3-7c9743ce2930	2026-02-01 12:07:45.664+03	f	2026-01-02 12:07:45.665863+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
bf7606c8-7952-4bfd-ba43-adca465b3728	7aa55a55-db98-4a9d-a743-d877c7d8dd21	72fd1b9aa4615c701a49982b7f2e81dbd93e580e14bc11d5b3362363b0cc1586	f87a011f-61e6-4f35-b3f1-e8d5ff0db7dd	2026-02-01 12:08:06.516+03	f	2026-01-02 12:08:06.516921+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
e2bd39d1-d202-46db-9f8f-592d30228c74	7aa55a55-db98-4a9d-a743-d877c7d8dd21	4a8b6211f741d158b5df9647da7613fcd354e4c150afba7735a0cb588ee86248	9b6eb70d-153d-4294-ae4e-97ea39fd969a	2026-02-01 12:14:31.879+03	f	2026-01-02 12:14:31.879948+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
7bfd5116-9d55-48a7-a4c0-c00ade0a448d	7aa55a55-db98-4a9d-a743-d877c7d8dd21	097219960106bcaaaf8724724c0d58b2e1e6ccff032f6b58c70a9c9b838add0a	94aec6ee-6f90-4c8d-837c-18fbd61e029f	2026-02-01 12:14:39.864+03	f	2026-01-02 12:14:39.865319+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
f1696ca0-997f-4c52-9d83-123ea93512f8	7aa55a55-db98-4a9d-a743-d877c7d8dd21	cffbe37d9370f24e195910c12421a3c94d014db0b038d123226c59c7acb6e3e0	8ccc1037-09b6-4dec-a838-59630ee6ce45	2026-02-01 12:23:51.258+03	f	2026-01-02 12:23:51.259119+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
759e32e2-2184-4581-9571-5d17797283ff	7aa55a55-db98-4a9d-a743-d877c7d8dd21	71e9e98bd2e8c789b8630566cc786386a3af239f9cf59b628ece9c8a983e61d5	5aadcbb2-0201-464c-a290-705c5d7e98c1	2026-02-01 12:23:59.356+03	f	2026-01-02 12:23:59.357491+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
02a0117d-a469-4aa2-ba7f-e4ce22fb5989	7aa55a55-db98-4a9d-a743-d877c7d8dd21	c769e8104c5216e38494ab34c29cafa9064f62660377f99aed083500b728ed5a	ef73f1ed-c23b-40f2-a42a-ec51566296a0	2026-02-01 12:24:08.132+03	f	2026-01-02 12:24:08.133343+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
95196036-59c5-498b-9046-cf097fdb59be	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2d1615d265554864ab16e3c4e9e8fb43ee9582f20a440247df881943d9d57a8b	80e2ed2b-b1f5-4c31-bf9b-322ae0a58036	2026-02-01 12:30:45.332+03	f	2026-01-02 12:30:45.334064+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
9a47595c-354b-4827-b3ce-f725078f7858	7aa55a55-db98-4a9d-a743-d877c7d8dd21	ac3a478ec5a1edd75d33ddfb23a06627fa4a6b33e7d0a203f9ca5877cc814897	de2c08cb-6053-40cb-8fef-d7b1d8072cd3	2026-02-01 12:30:53.185+03	f	2026-01-02 12:30:53.186597+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
fcaf2f28-8bf8-43c0-977d-07964a38bc14	7aa55a55-db98-4a9d-a743-d877c7d8dd21	982fc8ca5c8fc168d11cc7decfedec1805d88429cad3c60ab0c045b819497906	e0a26588-2ca0-43f8-9029-5a519a2ee372	2026-02-01 12:31:00.106+03	f	2026-01-02 12:31:00.107062+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
3843b160-6acf-4f0a-b980-7b585ec3ec59	7aa55a55-db98-4a9d-a743-d877c7d8dd21	99261f69b476d61c40408970ebf7f572eb95bd1d00464ef21a710e8569ef2f35	7ebe012d-e8d4-41b1-9e9d-efe18d7ee4e8	2026-02-01 12:31:08.075+03	f	2026-01-02 12:31:08.076109+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
78621206-9b27-4aeb-92e3-d2525b3555c9	7aa55a55-db98-4a9d-a743-d877c7d8dd21	bbea06ed6fd656a012386715b9d79e83ad1768a13336e21b05edf5dac63b104b	58c27a7c-0ca5-4b7b-b90b-d75bf3e559e3	2026-02-01 12:37:59.113+03	f	2026-01-02 12:37:59.114415+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
9d789287-caa5-4169-af76-5b62957e5869	7aa55a55-db98-4a9d-a743-d877c7d8dd21	c30ec6197c82ff158bce29b2522a67f55da76b1f8ede9ab69192058f06498e6e	fc99ae28-cc6e-4854-8b98-423eee145440	2026-02-01 12:39:41.544+03	f	2026-01-02 12:39:41.545232+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
54dadabd-e1d3-43a0-9c1c-fe0115dc4db9	7aa55a55-db98-4a9d-a743-d877c7d8dd21	f9683fc2ade21b03badccb5e9bab11ab737034a47735be24c156301ae903cf92	d82a548c-6fa9-48c0-acfb-7316cfef4d80	2026-02-01 12:40:57.564+03	f	2026-01-02 12:40:57.565107+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
cfba7b9b-c9e2-46a0-ab1c-1baefb40bf7e	7aa55a55-db98-4a9d-a743-d877c7d8dd21	f464e7ddad06726d18b90b84ab1edf9ea786140bc8dc6b2419ad7e931bf8d271	e7d86971-3071-4eae-acdb-55cd981d757a	2026-02-01 12:42:58.237+03	f	2026-01-02 12:42:58.238144+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
8cfe39e6-885d-4542-8bd1-8c8f8a0f7584	7aa55a55-db98-4a9d-a743-d877c7d8dd21	cf32cdf79bbaf8e25e56b4db1b91f615d0273eba5d71fbfd6c5a92537a57e5f1	7bb4a6f1-0766-4a06-bc2c-42fb9bd135c6	2026-02-01 12:49:40.69+03	f	2026-01-02 12:49:40.691138+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
4f96d280-88f1-4f57-b7d3-00835030096c	7aa55a55-db98-4a9d-a743-d877c7d8dd21	84a86f4494c338ff6c26e700faaa7aa4cb03d8c19c5f551731d2ad54f3897372	172a43de-eb4d-42fe-bef7-8ebd81ab7101	2026-02-01 12:53:59.517+03	f	2026-01-02 12:53:59.519253+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
f59ece9c-e6fe-48d9-a9f4-737c2d5ae05c	7aa55a55-db98-4a9d-a743-d877c7d8dd21	edf62e268b78fba3448c2dbf0acb93989fb06971a332009819ff7b0ec94d2a7f	f134eb12-858e-449d-a78a-dfeb19e0aee5	2026-02-01 12:59:25.428+03	f	2026-01-02 12:59:25.428747+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
23eb60b7-96ea-46d9-9959-ba6043c8988b	7aa55a55-db98-4a9d-a743-d877c7d8dd21	6fb46b5ee7d9450fe43eae6d07e97c207965d54bb74169c695fefcbfac9a5b49	e97eb15f-8963-4c01-85f9-19d37ca4b272	2026-02-01 13:08:24.388+03	f	2026-01-02 13:08:24.389269+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
0c828d15-668e-4fd4-b00e-be7422700a31	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2598d9694b444ed41c59f46f0506c3d75fdec9491e42f37d15813eea91d32582	26ff2b9d-5dc6-49a8-8eec-b3deadeefcc2	2026-02-01 13:12:48.239+03	f	2026-01-02 13:12:48.240173+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
7fd3ce88-40eb-41d4-b778-4b0c8cba791c	7aa55a55-db98-4a9d-a743-d877c7d8dd21	196d77168f694663d1c7e9e26e11f4ebc18ac70809feadd5e58ac0b5a53fe5ca	50718384-d0f4-4dd4-a1a8-5a19df22406b	2026-02-01 13:46:12.14+03	f	2026-01-02 13:46:12.14077+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
0dfe9cd4-1e27-46cf-aa73-9dbee8143226	7aa55a55-db98-4a9d-a743-d877c7d8dd21	b300972c2a1b7828ecbbce4f4134583ffc23475becd366c77d935194d0a51548	76d6397a-0a0b-4476-a1d8-f467d3ef6fbb	2026-02-01 13:46:20.477+03	f	2026-01-02 13:46:20.478143+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
acf8355e-9924-456b-b7aa-36d681f4a13a	7aa55a55-db98-4a9d-a743-d877c7d8dd21	d400aba717b1f0ed1aa728b87f49eb27efa90b88e1ac6e63193b7ef86a8ad73d	e95cd07f-cb6a-4356-aac7-e6aa41bbb433	2026-02-01 13:48:35.76+03	f	2026-01-02 13:48:35.761325+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
5e17415f-8315-441e-a569-4e6f0ea542d9	7aa55a55-db98-4a9d-a743-d877c7d8dd21	5e85939ec50b7e4402da0cdfc3e4568ee0e9c109d4fac89f84ac90f2bad74252	b9a11b9a-f20e-4daa-af75-ae5b57491138	2026-02-01 14:45:59.372+03	f	2026-01-02 14:45:59.372816+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
7fd405b1-edbb-4339-be9e-88cc221e4a0b	7aa55a55-db98-4a9d-a743-d877c7d8dd21	67f0b8db5db72a172aced31022a544fcf03d98cb4f29c3c186f039d3e0923ec4	3f75ae70-186e-4491-a9fd-0f37d323207b	2026-02-01 14:46:34.953+03	f	2026-01-02 14:46:34.953799+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
30ef474b-1a02-40de-84ca-66ce1933fdd7	7aa55a55-db98-4a9d-a743-d877c7d8dd21	e50c64db0e1578ef80a895af3e49270aa192bd0f98ae75f4b7b650064af0826b	49089fbb-1064-4198-9c68-47cf5586fb21	2026-02-01 14:47:49.463+03	f	2026-01-02 14:47:49.464181+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
395b77f6-aba7-4646-8d82-707811d301ef	7aa55a55-db98-4a9d-a743-d877c7d8dd21	99d74ddf8fc1a1e26c655bded114c5b23bd61a8adcbfa266a9fe11223503b635	7a55d332-faba-4fff-b76e-55902f21b1ef	2026-02-01 14:48:03.03+03	f	2026-01-02 14:48:03.030308+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
2e0828f1-f5fb-4ac4-abbb-0cdc3cfc6f39	7aa55a55-db98-4a9d-a743-d877c7d8dd21	73bcb3e9e7bc183b00466a25adb168c0a460a4e3d96b51227dec9e16e4683066	92267e30-7973-4e8b-b6ad-f00ebedc3213	2026-02-01 14:48:18.114+03	f	2026-01-02 14:48:18.11446+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
34ef0473-e1ff-471c-be30-03578c3a6c55	7aa55a55-db98-4a9d-a743-d877c7d8dd21	f83749a9310e297b56a97233bf36a223151e17f3a8f9be76e495ed6dcea40757	3d937d9d-167c-4f99-805c-80e83cf451df	2026-02-01 14:49:02.278+03	f	2026-01-02 14:49:02.278989+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
5475ba9e-969c-46ce-872e-14cb7db156a5	7aa55a55-db98-4a9d-a743-d877c7d8dd21	7ee31cd9220be2c4c8b2845dc244a7c4471d3454693b8dac144af3cd7b8843ab	48610341-ee07-48ff-b27e-00a5740645af	2026-02-01 15:10:11.533+03	f	2026-01-02 15:10:11.53422+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
aaf67b57-6d9d-4fb2-9761-87e3e05bcb48	7aa55a55-db98-4a9d-a743-d877c7d8dd21	7da74f726c99ed78713e738d121394cd293a448cad31ed762ea74b0dfebec79c	7d606d1e-b5bf-4712-911a-c6114431f635	2026-02-01 15:11:32.656+03	f	2026-01-02 15:11:32.657982+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
bc75377f-786f-467a-bab7-60b4dfcf815a	7aa55a55-db98-4a9d-a743-d877c7d8dd21	45bac55d06f050d67158a5f3ca9daf1d1d2961ac0fa4864bad5b5950ef400d17	6afb6d1b-4fb0-41dc-9976-b1627744c2a2	2026-02-01 21:37:06.879+03	f	2026-01-02 21:37:06.880339+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
aa92a7f2-4c39-4fc1-85dd-c3a6ca69387e	7aa55a55-db98-4a9d-a743-d877c7d8dd21	5c59dd9f82a95b69d3e676e281f74e2b7639723d5d4fbc470d07c3a7b624e336	eeb52d25-d751-4161-ba7e-b6a2cd33cd41	2026-02-01 21:37:14.821+03	f	2026-01-02 21:37:14.822757+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
383bd5e2-79f3-4f2a-87c4-3724c8837def	7aa55a55-db98-4a9d-a743-d877c7d8dd21	58f37c54d6f451ec6448f558271c0493ba71491b95c167f9da3223faa1fcbae4	c562914f-0098-4226-b9b0-152e4fbf233e	2026-02-01 21:38:22.593+03	f	2026-01-02 21:38:22.594355+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
2616707b-1734-428f-bcc0-9b40cecaaeaa	7aa55a55-db98-4a9d-a743-d877c7d8dd21	08b00b4cca076cd626803aa3fd85ff8ecd4865b1c5fe9a286412b3a2b9b75bfc	45caf829-95bc-4027-a181-43b5a25716a7	2026-02-01 21:38:31.648+03	f	2026-01-02 21:38:31.648733+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
f5bc949a-be97-40f1-aa12-fba80f0d507a	7aa55a55-db98-4a9d-a743-d877c7d8dd21	1c308648a2b3d1cf4845867dc547cba91be6c6a669260aa85217b81e4c40d713	2a94fabe-ef83-4b8c-b246-bdd4ebbc7938	2026-02-01 21:40:07.35+03	f	2026-01-02 21:40:07.351727+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
b071ac7c-35af-4a2b-910a-38682c292e40	7aa55a55-db98-4a9d-a743-d877c7d8dd21	ebfca8afefeb9c75496df28b850331e2a9bccee630e5bbc7e8dedbfc07a0d89d	2768369c-70e5-429b-98b0-70a08bca4c84	2026-02-01 21:40:13.777+03	f	2026-01-02 21:40:13.778227+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
d1bc7244-c1e0-45fe-96bc-e6c9eff9857b	7aa55a55-db98-4a9d-a743-d877c7d8dd21	9209b371745a1ef779263822d6fc504e11e7f8bcbfb846e76221cfac2d264b40	c756b0eb-248c-4ed5-908b-1e996c9ea411	2026-02-01 21:40:20.05+03	f	2026-01-02 21:40:20.051672+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
9e61b75d-036e-4428-a55c-9cd38d793da6	7aa55a55-db98-4a9d-a743-d877c7d8dd21	1bd70c2fac0028eb46e5488e9b3f458b8285c82660e8c0088403c6da85a8da87	febdb72e-31bf-4fd4-90d1-2b33ccddc8f4	2026-02-01 21:40:27.73+03	f	2026-01-02 21:40:27.731513+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
f7ffdfb9-7f09-4ab3-9ba6-5447349356c3	7aa55a55-db98-4a9d-a743-d877c7d8dd21	dfe71e3726a801ce870855f2e3bc59be14144e114e347c3d16a855348572b0f6	b820930b-5e21-4078-a995-1da8bee7dae9	2026-02-01 21:41:02.048+03	f	2026-01-02 21:41:02.049236+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
25a99ab1-1cd6-4036-8920-1a709baddca7	7aa55a55-db98-4a9d-a743-d877c7d8dd21	c47d98a3b6e4d1d0117880010c8fe9693a2ea1fd8d5bee701bf1940a191157ce	b9999149-5279-4234-b979-704332dba760	2026-02-01 21:41:08.644+03	f	2026-01-02 21:41:08.644794+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
850b74a2-fe9a-42d2-98d5-9377a5080111	7aa55a55-db98-4a9d-a743-d877c7d8dd21	34d73ef72c383caa9b6da568ae8639a4f47b898b4032339b5a0b634111f95b20	8b1c1a9c-5c37-477e-82a5-95496dba7575	2026-02-01 21:41:14.357+03	f	2026-01-02 21:41:14.357443+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
6754c282-8ddd-4249-8015-1a3a74b37741	7aa55a55-db98-4a9d-a743-d877c7d8dd21	ebcd4850d5f1019069cc2e49d9ef3117efa567bcdb8acd413861ea59f126e355	b2f077d5-b5ac-4a2d-b5e2-3c556a02b459	2026-02-01 21:41:22.475+03	f	2026-01-02 21:41:22.475733+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
dfc6bfa4-9528-4388-9477-00efdd8a015d	7aa55a55-db98-4a9d-a743-d877c7d8dd21	c3830e95a390d7f35d0d17447037e5e811ec8b08d1f14b35772f45a448b3b18c	764cbb07-fb5a-435b-926e-917065350c54	2026-02-01 21:41:27.401+03	f	2026-01-02 21:41:27.401992+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
fe4a7a6f-ea62-4fdf-b200-6a9a93f43acd	7aa55a55-db98-4a9d-a743-d877c7d8dd21	dacca57e3f05e2841942a877525e60af8d7081cb6fe883aaf2ca7a51eb8768dd	cb96caab-5f3e-48a9-b782-2512def84560	2026-02-01 21:41:36.623+03	f	2026-01-02 21:41:36.624019+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
c333ba24-d952-4f2f-ad78-e131ca75aa2c	7aa55a55-db98-4a9d-a743-d877c7d8dd21	fd715e70e878becaa23a296d31231b09dfd95e3cb13a52ac7f1e0b70798164bc	74491994-853a-4b8c-83da-d691051c8cb7	2026-02-01 21:41:42.774+03	f	2026-01-02 21:41:42.774988+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
0c2c804b-53a4-4bd8-b74f-7a54afada393	7aa55a55-db98-4a9d-a743-d877c7d8dd21	1716865991b91f670903eec7dca50004c4efd8dbac6dc73e5eb074beb83727ef	0bcbf774-33a7-43fe-9702-a53c91a9ea70	2026-02-01 21:41:54.233+03	f	2026-01-02 21:41:54.233783+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
6bfb7d76-bfd2-44f1-9206-944f6076f1ea	7aa55a55-db98-4a9d-a743-d877c7d8dd21	efdc4a5fe37e195ec675c60f531754118924288898b749d6d14f4ad5ac7a13c5	f1cdbaa2-aabf-4c8e-beb9-7b5e31eed5d1	2026-02-01 21:42:00.461+03	f	2026-01-02 21:42:00.461139+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
1d20ad16-65be-406e-92bb-dfeb28d0ef0e	7aa55a55-db98-4a9d-a743-d877c7d8dd21	68923af0d3b87abeac470170e0951b468e7c4e16cbd3b91390e8b824b77e891a	ec993469-1004-472a-bcda-488c691f713d	2026-02-01 22:26:51.455+03	f	2026-01-02 22:26:51.456532+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
295e0e1a-503a-4368-bd58-e09a69f1ef3e	7aa55a55-db98-4a9d-a743-d877c7d8dd21	a4c50d03ab6d56b4e6971436cbdd7160835a8ca23d7725dc13452ad6aec44c20	59ae3561-c246-4fdd-b1ae-e73edd3c7ee5	2026-02-01 22:27:09.187+03	f	2026-01-02 22:27:09.188406+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
8b4aa0e5-5d99-4cd8-b2f4-2e71e1090b32	7aa55a55-db98-4a9d-a743-d877c7d8dd21	8e6500aa49001a99840f5654a5fa2b554b6a787922733a121f8863c5ff320679	487ae5ba-ef0e-415b-9aff-2e3b39d8719c	2026-02-01 22:27:25.411+03	f	2026-01-02 22:27:25.411991+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
d9d3db97-6667-451f-ae55-68a8595bf49f	7aa55a55-db98-4a9d-a743-d877c7d8dd21	0a8147ba9f2b0b442b3dd6bcb9c10a88636c5bba55d81590af1fb7667e62c003	1277bfdc-a54c-44cb-b4cb-ae3ab7ae9631	2026-02-01 22:27:42.644+03	f	2026-01-02 22:27:42.645002+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
d4a69831-e412-4027-ad7a-763726bbad4d	7aa55a55-db98-4a9d-a743-d877c7d8dd21	9f18a574873736de651302fd92936cfaae49693008b87bc5d1e108c6604c5097	1e74ae7f-be33-4cb4-8e4d-ec11da3db1d2	2026-02-01 22:53:18.652+03	f	2026-01-02 22:53:18.65374+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
bda2b780-96e1-470b-b7a8-c5786c364c4e	7aa55a55-db98-4a9d-a743-d877c7d8dd21	4c0387bcb458c3d88f566e5818a382d85913a8f8b679c7ad1de07c969575ca23	a7967e09-2987-4a84-916a-abb4965502cf	2026-02-01 22:53:25.587+03	f	2026-01-02 22:53:25.588098+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
ddd7907d-378e-4e23-91da-de7f551d4416	7aa55a55-db98-4a9d-a743-d877c7d8dd21	532024fca7628803e04200b005e29e79ca9ff3782b6076ccfbdb25d726036a3a	846402c5-eb3d-4646-a88e-ca9e4e8fb29b	2026-02-01 22:53:58.81+03	f	2026-01-02 22:53:58.811132+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
26ed224f-eaf3-4f7f-a4ba-24332101a54f	7aa55a55-db98-4a9d-a743-d877c7d8dd21	e33ac2bf09bd161e15fe951389c5aabab6ad8bada772fbefcedb46cd804e0cee	bf6665a7-d4a3-4aa2-aab1-7a35dcb2b011	2026-02-01 22:54:05.753+03	f	2026-01-02 22:54:05.754361+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
c1c99a99-8a46-4e81-929d-f1f1be8ed469	7aa55a55-db98-4a9d-a743-d877c7d8dd21	fefc075c7027ac4bbcfe9fb427c33c6f329135aa511406c507f0cadb326dc0f0	31c79325-f6d5-4d1d-8b75-38f004b7a31a	2026-02-01 22:55:27.748+03	f	2026-01-02 22:55:27.748985+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
33da1d84-901a-4235-963a-bbfad59482b9	7aa55a55-db98-4a9d-a743-d877c7d8dd21	9322dc7f4114747be2db90597f3776f4a747b6bb81b948dc6b48de283f551430	865142b9-a074-46a8-a30f-66f3f85617e0	2026-02-01 22:55:34.885+03	f	2026-01-02 22:55:34.88568+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
0fe538ce-f374-4578-94ad-9f24c0c5cd6e	7aa55a55-db98-4a9d-a743-d877c7d8dd21	6808c0e4b9e83b8bd1025f513cd811e179571ab37ef4c698ba5b9781743933f8	ab7f62e9-2687-4bcd-a349-c4b7da434055	2026-02-01 23:03:44.587+03	f	2026-01-02 23:03:44.58758+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
08368fde-0372-4581-b5a2-bc758e898056	7aa55a55-db98-4a9d-a743-d877c7d8dd21	cc09fef4399021a832f7708adacff9028ef4f3d21b9278c4b507f1196b304032	cd6cb819-1a99-45c4-b33d-f012e960e2f9	2026-02-01 23:03:51.35+03	f	2026-01-02 23:03:51.350863+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
ca3a7297-25f2-4623-bab2-90659924b971	7aa55a55-db98-4a9d-a743-d877c7d8dd21	b11f18aae498e44e3249c694952ecb0e5ef13292ecea66e42e0d6fb9d3748059	8503681f-0f3c-42eb-bf80-44f8261e86f4	2026-02-01 23:08:21.978+03	f	2026-01-02 23:08:21.978478+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
25c765d8-fae8-46b7-95d4-55229a46b85b	7aa55a55-db98-4a9d-a743-d877c7d8dd21	dbbc400bb1c04f9c8b3ac9efa541ed3ecdf0cb88540e0d896a2e8ba03c75e1b3	4537e624-4f05-4848-8b43-030335e1cd97	2026-02-01 23:08:27.281+03	f	2026-01-02 23:08:27.281747+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
878298ca-096d-4c91-8f5c-a886ae64a99e	7aa55a55-db98-4a9d-a743-d877c7d8dd21	3619c1dce2c7098d32c522707688714575fa85e0f59c946cbd1ccb1bef0ba17a	0fdffaf0-a5e8-4802-bbdf-c9a2454e013f	2026-02-01 23:13:15.425+03	f	2026-01-02 23:13:15.426207+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
68c1eb52-3d16-4319-9c00-13597fb4ebb2	7aa55a55-db98-4a9d-a743-d877c7d8dd21	56e9a5f851d4bd3c9151ad690168667c403c354d400d5db1bb781cc5c6c1a650	856f53b2-505d-46bd-8973-2f67e1a3dfad	2026-02-01 23:13:20.891+03	f	2026-01-02 23:13:20.892006+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
3c6e2bbd-54c8-4fa1-bef8-8b479c08acb2	7aa55a55-db98-4a9d-a743-d877c7d8dd21	3d7caf1bd8f590ac944a1d8c8a7aa2692920396a5102e286e0827e5831ea392a	42e11d69-8276-4da9-85bb-3b63c0a3b459	2026-02-01 23:13:36.66+03	f	2026-01-02 23:13:36.660774+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
6235edf0-5310-4c70-b280-293c51c3991a	7aa55a55-db98-4a9d-a743-d877c7d8dd21	56aa74964f49084cd5707013c46641832f82d211562e6611ef8ed903ca535435	791d1001-8011-42f8-8631-105145745399	2026-02-01 23:30:31.731+03	f	2026-01-02 23:30:31.732547+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
076b892c-59e2-4368-acb8-27e3000881ae	7aa55a55-db98-4a9d-a743-d877c7d8dd21	c78e26b8af2664e3cb0da5d2f1b46c63282e0d05ad212023e5c2628fb4ea65ed	4af9f0f5-46fc-4dd2-bf71-c90da9dd73d3	2026-02-01 23:30:39.156+03	f	2026-01-02 23:30:39.157464+03	\N	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.22000; en-US) PowerShell/7.4.13	::1
5b7015d4-0ae2-44b8-901a-1d0a73b868d9	7aa55a55-db98-4a9d-a743-d877c7d8dd21	38788fe403c6d98e39f0686f8f55e3d202596515a8dad24484371492176f945b	f9e747aa-02c4-49e3-9332-8683b264a71b	2026-02-26 12:35:44.524+03	t	2026-01-27 12:35:44.526203+03	2026-01-27 21:41:57.670262+03	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	::1
fb32ed52-7b09-4d3e-8369-0ec5610fb7f4	7aa55a55-db98-4a9d-a743-d877c7d8dd21	9106c8cb5afc55ad96a85ce22ce50fe47b3e8b60da252d17b16e196ac8d05d25	f9e747aa-02c4-49e3-9332-8683b264a71b	2026-02-26 21:41:57.68+03	t	2026-01-27 21:41:57.68054+03	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	::1
\.


--
-- Data for Name: report_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.report_runs (id, report_type, report_name, parameters, generated_by_id, start_date, end_date, record_count, file_path, file_format, execution_time_ms, created_at) FROM stdin;
\.


--
-- Data for Name: route_deliveries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.route_deliveries (id, route_id, delivery_order_id, delivery_sequence, estimated_arrival_time, actual_arrival_time, created_at) FROM stdin;
\.


--
-- Data for Name: sale_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sale_items (id, sale_id, product_id, batch_id, quantity, unit_price, unit_cost, discount_amount, total_price, profit, created_at, uom_id, product_type, income_account_id, product_name, item_type) FROM stdin;
93b5ba5b-6f2a-4434-b76d-c27ce4b47985	bc3e48d7-0e22-423e-95c0-23318fcff46f	8879d9f3-52db-4c4f-8331-e29787bce8d5	\N	2.0000	130000.00	100000.00	0.00	260000.00	60000.00	2026-01-02 00:36:23.434124+03	b51b8119-a0b9-4886-b61f-f5d680a67c54	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	KAKIRA SUGAR 25kg	product
4ac6e770-2ee4-4d3c-b77d-26f490d6afe8	623a9d1e-5c09-41bf-8f6e-21a9a48ddbc6	88fb682a-0d49-41f0-b57f-80a3ea8ded59	\N	1.0000	6500.00	5000.00	0.00	6500.00	1500.00	2026-01-02 00:50:02.647687+03	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	ROYCO BEEF	product
63de3c33-b2b3-4df6-9369-15b0252d7d43	1204acdb-8834-4657-9f90-e1d11bb4c1fb	88fb682a-0d49-41f0-b57f-80a3ea8ded59	\N	1.0000	6500.00	5000.00	0.00	6500.00	1500.00	2026-01-02 10:05:13.329891+03	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	ROYCO BEEF	product
798bdb2f-71fd-4099-8b99-122c6ba619d5	0ff95ae6-4948-44c5-baf4-bfdab802958e	8879d9f3-52db-4c4f-8331-e29787bce8d5	\N	1.0000	130000.00	100000.00	0.00	130000.00	30000.00	2026-01-02 10:05:13.845336+03	b51b8119-a0b9-4886-b61f-f5d680a67c54	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	KAKIRA SUGAR 25kg	product
97fa977c-3707-4760-a612-a77468cb0f30	adad804b-bd8c-458e-89f4-a2bbd083ab60	88fb682a-0d49-41f0-b57f-80a3ea8ded59	\N	1.0000	6500.00	5000.00	0.00	6500.00	1500.00	2026-01-02 10:05:14.543684+03	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	ROYCO BEEF	product
c81a43d9-b1c9-4821-a253-2039e13ab9c4	7369e6e1-e21c-4ee1-b3e8-75b3b2b0a1bd	88fb682a-0d49-41f0-b57f-80a3ea8ded59	\N	1.0000	6500.00	5000.00	0.00	6500.00	1500.00	2026-01-02 11:51:36.862564+03	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	ROYCO BEEF	product
180e29c8-883b-4b95-ab20-40e133fcf57a	79cc9be3-8439-4fb6-a5f0-21233b5a911f	8879d9f3-52db-4c4f-8331-e29787bce8d5	\N	1.0000	130000.00	100000.00	0.00	130000.00	30000.00	2026-01-28 22:57:59.55206+03	b51b8119-a0b9-4886-b61f-f5d680a67c54	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	KAKIRA SUGAR 25kg	product
7a10b4e9-50b9-4360-ba7a-e05ffc99fb45	c71211a2-7934-473f-8338-d8347f08a76b	88fb682a-0d49-41f0-b57f-80a3ea8ded59	\N	1.0000	6500.00	5000.00	0.00	6500.00	1500.00	2026-01-28 23:02:57.804154+03	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	ROYCO BEEF	product
fbd7e786-2cd0-4682-be11-68c34f429e09	f8643456-3f7f-4091-a05c-ce0308a562df	8879d9f3-52db-4c4f-8331-e29787bce8d5	\N	1.0000	130000.00	100000.00	0.00	130000.00	30000.00	2026-01-29 09:25:26.696915+03	b51b8119-a0b9-4886-b61f-f5d680a67c54	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	KAKIRA SUGAR 25kg	product
ed9d10e6-910b-4737-848a-b5cbe795f68d	f8643456-3f7f-4091-a05c-ce0308a562df	88fb682a-0d49-41f0-b57f-80a3ea8ded59	\N	1.0000	6500.00	5000.00	0.00	6500.00	1500.00	2026-01-29 09:25:26.696915+03	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	ROYCO BEEF	product
a26ae716-8ecc-4f8c-8769-01420d7e46ba	f8643456-3f7f-4091-a05c-ce0308a562df	3988ca33-60c4-4648-8701-72c5484185ed	\N	1.0000	7500.00	6000.00	0.00	7500.00	1500.00	2026-01-29 09:25:26.696915+03	5e1a17fa-49a7-486e-9096-24f8d386ae02	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	Blue Band 500g	product
593bfec1-3abe-44fc-8047-117569c0b1a7	f957c9d4-2720-4180-8f93-3c113178975b	8879d9f3-52db-4c4f-8331-e29787bce8d5	\N	1.0000	130000.00	100000.00	0.00	130000.00	30000.00	2026-01-29 09:45:51.303928+03	b51b8119-a0b9-4886-b61f-f5d680a67c54	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	KAKIRA SUGAR 25kg	product
8ac0bef1-f58d-43ed-8cd5-95ae6fec0438	f957c9d4-2720-4180-8f93-3c113178975b	88fb682a-0d49-41f0-b57f-80a3ea8ded59	\N	1.0000	6500.00	5000.00	0.00	6500.00	1500.00	2026-01-29 09:45:51.303928+03	97c8b6ea-1d45-48c8-bf5a-2b738051aa15	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	ROYCO BEEF	product
5ed59d37-fc62-4769-988c-d0dc0f005dcf	f957c9d4-2720-4180-8f93-3c113178975b	3988ca33-60c4-4648-8701-72c5484185ed	\N	1.0000	7500.00	6000.00	0.00	7500.00	1500.00	2026-01-29 09:45:51.303928+03	5e1a17fa-49a7-486e-9096-24f8d386ae02	inventory	78c709b8-3b96-4368-ba15-ca0baa3d4867	Blue Band 500g	product
\.


--
-- Data for Name: sale_discounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sale_discounts (id, sale_id, sale_item_id, discount_id, discount_type, discount_value, discount_amount, original_amount, final_amount, authorization_id, created_at) FROM stdin;
\.


--
-- Data for Name: stock_counts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stock_counts (id, name, location_id, state, created_by_id, validated_by_id, created_at, validated_at, snapshot_timestamp, notes) FROM stdin;
\.


--
-- Data for Name: stock_count_lines; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stock_count_lines (id, stock_count_id, product_id, batch_id, expected_qty_base, counted_qty_base, uom_recorded, notes, created_by_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stock_movements (id, movement_number, product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by_id, created_at, uom_id, stock_count_id) FROM stdin;
690a8478-71f2-4f55-aa70-f0669ef1cbee	SM-20260101-212422-8f77a8d8	3988ca33-60c4-4648-8701-72c5484185ed	2ee108c7-ffaf-4011-a8b9-a13c803f25db	GOODS_RECEIPT	120.0000	\N	GOODS_RECEIPT	2ee108c7-ffaf-4011-a8b9-a13c803f25db	\N	\N	2026-01-02 00:24:22.055749+03	\N	\N
04d59b97-dba7-43a2-a43b-ff542a4b1253	MOV-2026-0001	3988ca33-60c4-4648-8701-72c5484185ed	2ee108c7-ffaf-4011-a8b9-a13c803f25db	GOODS_RECEIPT	120.0000	6000.00	GOODS_RECEIPT	815258be-c87a-403e-b18e-07a02358b06c	GR GR-2026-0001 - Batch BATCH-20260101-001	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 00:24:22.055749+03	\N	\N
a4abcba8-1afa-44cc-b563-2d7e8f4c2c85	SM-20260101-212422-6ba1c7b1	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	GOODS_RECEIPT	10.0000	\N	GOODS_RECEIPT	977cc0d7-95a1-438d-81f4-194619490810	\N	\N	2026-01-02 00:24:22.055749+03	\N	\N
636bf03a-a63d-4d87-b68f-89e7b6705679	MOV-2026-0002	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	GOODS_RECEIPT	10.0000	100000.00	GOODS_RECEIPT	815258be-c87a-403e-b18e-07a02358b06c	GR GR-2026-0001 - Batch BATCH-20260101-002	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 00:24:22.055749+03	\N	\N
b565791f-1f22-49c3-ab77-650cc234726b	SM-20260101-212422-51f5498c	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	GOODS_RECEIPT	10.0000	\N	GOODS_RECEIPT	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	\N	\N	2026-01-02 00:24:22.055749+03	\N	\N
c61beec9-2490-4971-a05e-3cc85acb684f	MOV-2026-0003	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	GOODS_RECEIPT	10.0000	5000.00	GOODS_RECEIPT	815258be-c87a-403e-b18e-07a02358b06c	GR GR-2026-0001 - Batch BATCH-20260101-003	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 00:24:22.055749+03	\N	\N
6a7b8d63-c166-4ccf-9a9c-19bf7290455d	SM-20260101-213623-06bb5e0d	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	SALE	2.0000	\N	ADJUSTMENT	977cc0d7-95a1-438d-81f4-194619490810	\N	\N	2026-01-02 00:36:23.434124+03	\N	\N
a1b20ea7-5c20-495a-b58e-3aaca2fb49df	MOV-2026-0004	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	SALE	2.0000	100000.00	SALE	bc3e48d7-0e22-423e-95c0-23318fcff46f	Sale SALE-2026-0001 - FEFO batch deduction	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 00:36:23.434124+03	\N	\N
b49ff965-112f-4cee-849d-2fcc0b64b17c	SM-20260101-215002-f88ec6dc	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	\N	ADJUSTMENT	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	\N	\N	2026-01-02 00:50:02.647687+03	\N	\N
32d3253f-2e34-4745-acd9-40361fb8b03a	MOV-2026-0005	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	5000.00	SALE	623a9d1e-5c09-41bf-8f6e-21a9a48ddbc6	Sale SALE-2026-0002 - FEFO batch deduction	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 00:50:02.647687+03	\N	\N
14a4b4af-1656-4ae4-9e60-d8508cb13ee6	SM-20260102-070513-f24f1632	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	\N	ADJUSTMENT	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	\N	\N	2026-01-02 10:05:13.329891+03	\N	\N
88dfc3e5-458b-41ca-8b7a-2b79addba8f2	MOV-2026-0006	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	5000.00	SALE	1204acdb-8834-4657-9f90-e1d11bb4c1fb	Sale SALE-2026-0003 - FEFO batch deduction	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 10:05:13.329891+03	\N	\N
62f9aabd-2f40-4007-aff1-71bb5626cf5c	SM-20260102-070513-3da5d7dd	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	SALE	1.0000	\N	ADJUSTMENT	977cc0d7-95a1-438d-81f4-194619490810	\N	\N	2026-01-02 10:05:13.845336+03	\N	\N
011c17de-ead3-4754-849c-ce9fdc2cb400	MOV-2026-0007	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	SALE	1.0000	100000.00	SALE	0ff95ae6-4948-44c5-baf4-bfdab802958e	Sale SALE-2026-0004 - FEFO batch deduction	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 10:05:13.845336+03	\N	\N
05ead394-8726-4d1b-9a64-3d9bef7dba4c	SM-20260102-070514-7091e024	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	\N	ADJUSTMENT	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	\N	\N	2026-01-02 10:05:14.543684+03	\N	\N
5326aea9-95d6-4c87-a3e3-6cf42c18f270	MOV-2026-0008	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	5000.00	SALE	adad804b-bd8c-458e-89f4-a2bbd083ab60	Sale SALE-2026-0005 - FEFO batch deduction	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 10:05:14.543684+03	\N	\N
b5c37459-ed76-425b-802a-b416c61ffc6b	SM-20260102-085136-32cfed52	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	\N	ADJUSTMENT	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	\N	\N	2026-01-02 11:51:36.862564+03	\N	\N
2e9e7472-36cc-4dcb-afb4-ef175483b18f	MOV-2026-0009	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	5000.00	SALE	7369e6e1-e21c-4ee1-b3e8-75b3b2b0a1bd	Sale SALE-2026-0006 - FEFO batch deduction	956f87a9-18cf-49ee-94b4-9c44a94a7faf	2026-01-02 11:51:36.862564+03	\N	\N
a7f1f5f0-45f5-475d-a264-6d3228099eab	SM-20260128-195759-31487951	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	SALE	1.0000	\N	ADJUSTMENT	977cc0d7-95a1-438d-81f4-194619490810	\N	\N	2026-01-28 22:57:59.55206+03	\N	\N
127c08e9-ec9a-4c4a-a179-88d794e2dca6	MOV-2026-0010	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	SALE	1.0000	100000.00	SALE	79cc9be3-8439-4fb6-a5f0-21233b5a911f	Sale SALE-2026-0007 - FEFO batch deduction	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-28 22:57:59.55206+03	\N	\N
99785edc-e153-4ba5-8f31-61b7d2ad4b18	SM-20260128-200257-1beeee40	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	\N	ADJUSTMENT	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	\N	\N	2026-01-28 23:02:57.804154+03	\N	\N
d78d6267-e9ee-485a-988c-0ca3b0e7a84d	MOV-2026-0011	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	5000.00	SALE	c71211a2-7934-473f-8338-d8347f08a76b	Sale SALE-2026-0008 - FEFO batch deduction	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-28 23:02:57.804154+03	\N	\N
ef493f34-6e24-4316-921d-c501ca52bda3	SM-2026-000001	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	SALE	1.0000	\N	ADJUSTMENT	977cc0d7-95a1-438d-81f4-194619490810	\N	\N	2026-01-29 09:25:26.696915+03	\N	\N
fc070f9f-ac9b-4616-af1a-f5aa7edfa8de	MOV-2026-0012	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	SALE	1.0000	100000.00	SALE	f8643456-3f7f-4091-a05c-ce0308a562df	Sale SALE-2026-0009 - FEFO batch deduction	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-29 09:25:26.696915+03	\N	\N
6c626e51-801f-4d42-920f-1e9761cf6fcb	SM-2026-000002	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	\N	ADJUSTMENT	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	\N	\N	2026-01-29 09:25:26.696915+03	\N	\N
cdee473c-61cf-4c85-9e94-2e3a5c9d2f0c	MOV-2026-0013	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	5000.00	SALE	f8643456-3f7f-4091-a05c-ce0308a562df	Sale SALE-2026-0009 - FEFO batch deduction	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-29 09:25:26.696915+03	\N	\N
27e4fcda-b8f0-45f3-94f5-8bfd125f393c	SM-2026-000003	3988ca33-60c4-4648-8701-72c5484185ed	2ee108c7-ffaf-4011-a8b9-a13c803f25db	SALE	1.0000	\N	ADJUSTMENT	2ee108c7-ffaf-4011-a8b9-a13c803f25db	\N	\N	2026-01-29 09:25:26.696915+03	\N	\N
4f4401e6-6db0-44a8-83ce-16afb9a3c7de	MOV-2026-0014	3988ca33-60c4-4648-8701-72c5484185ed	2ee108c7-ffaf-4011-a8b9-a13c803f25db	SALE	1.0000	6000.00	SALE	f8643456-3f7f-4091-a05c-ce0308a562df	Sale SALE-2026-0009 - FEFO batch deduction	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-29 09:25:26.696915+03	\N	\N
b3f3bf4f-72fe-42c1-89ce-139a0e15bc8f	SM-2026-000004	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	SALE	1.0000	\N	ADJUSTMENT	977cc0d7-95a1-438d-81f4-194619490810	\N	\N	2026-01-29 09:45:51.303928+03	\N	\N
cbd304d2-5ad2-4319-9f70-f63623d2189c	MOV-2026-0015	8879d9f3-52db-4c4f-8331-e29787bce8d5	977cc0d7-95a1-438d-81f4-194619490810	SALE	1.0000	100000.00	SALE	f957c9d4-2720-4180-8f93-3c113178975b	Sale SALE-2026-0010 - FEFO batch deduction	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-29 09:45:51.303928+03	\N	\N
5d2bab5e-8615-4db5-9256-16982a488bec	SM-2026-000005	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	\N	ADJUSTMENT	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	\N	\N	2026-01-29 09:45:51.303928+03	\N	\N
e13d41b2-cb0e-43c3-bccf-a89e6dbf54f9	MOV-2026-0016	88fb682a-0d49-41f0-b57f-80a3ea8ded59	1b2e7999-fb5d-4523-b68c-11fd3ebffee4	SALE	1.0000	5000.00	SALE	f957c9d4-2720-4180-8f93-3c113178975b	Sale SALE-2026-0010 - FEFO batch deduction	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-29 09:45:51.303928+03	\N	\N
38c7f8d6-d19e-47e6-a963-31e3fae82ea7	SM-2026-000006	3988ca33-60c4-4648-8701-72c5484185ed	2ee108c7-ffaf-4011-a8b9-a13c803f25db	SALE	1.0000	\N	ADJUSTMENT	2ee108c7-ffaf-4011-a8b9-a13c803f25db	\N	\N	2026-01-29 09:45:51.303928+03	\N	\N
a1218658-966d-454b-9d49-f78de51cec78	MOV-2026-0017	3988ca33-60c4-4648-8701-72c5484185ed	2ee108c7-ffaf-4011-a8b9-a13c803f25db	SALE	1.0000	6000.00	SALE	f957c9d4-2720-4180-8f93-3c113178975b	Sale SALE-2026-0010 - FEFO batch deduction	7aa55a55-db98-4a9d-a743-d877c7d8dd21	2026-01-29 09:45:51.303928+03	\N	\N
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.suppliers ("Id", "SupplierCode", "CompanyName", "ContactName", "Email", "Phone", "Address", "DefaultPaymentTerms", "CreditLimit", "OutstandingBalance", "TaxId", "IsActive", "Notes", "CreatedAt", "UpdatedAt") FROM stdin;
630853f9-a521-4f3c-8848-3e17f2f21604	SUP-27Y6NUEJ	BOOSTER INRERNATIONAL	Benon	office@gmail.com	754245255788	kk1	30	0.000000	0.000000	\N	t	\N	2025-12-27 20:42:49.718776+03	2026-01-02 00:21:22.242898+03
bfc128ba-2380-43dd-a489-6bf9fe81082f	SUP-CLDJ73KG	STELLA STORES	office	office22@gmail.com	7542452057457	kk1	30	0.000000	0.000000	\N	t	\N	2025-12-28 10:42:38.930227+03	2026-01-01 10:52:55.318251+03
bc489975-0afd-459b-8b09-51de6ad24072	SUP-WXJ4T5UA	LEXIE AND SONS	office	office23@gmail.com	7542452042457	\N	30	0.000000	770000.000000	\N	t	\N	2025-12-28 10:43:24.370998+03	2026-01-02 00:27:35.79406+03
\.


--
-- Data for Name: supplier_invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.supplier_invoices ("Id", "SupplierInvoiceNumber", "InternalReferenceNumber", "SupplierId", "PurchaseOrderId", "InvoiceDate", "DueDate", "Subtotal", "TaxAmount", "TotalAmount", "AmountPaid", "OutstandingBalance", "Status", "CurrencyCode", "Notes", "CreatedAt", "UpdatedAt", deleted_at) FROM stdin;
1588398c-0ee6-4467-8bf7-a3b1e58ac6fc	SBILL-2026-0001	GR-2026-0001	bc489975-0afd-459b-8b09-51de6ad24072	\N	2026-01-01 03:00:00+03	2026-01-31 03:00:00+03	1770000.000000	0.000000	1770000.000000	1000000.000000	770000.000000	PartiallyPaid	USD	Auto-created from Goods Receipt GR-2026-0001	2026-01-02 00:24:22.055749+03	2026-01-02 00:27:35.79406+03	\N
\.


--
-- Data for Name: supplier_invoice_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.supplier_invoice_line_items ("Id", "SupplierInvoiceId", "LineNumber", "ProductId", "ProductName", "Description", "Quantity", "UnitOfMeasure", "UnitCost", "LineTotal", "TaxRate", "TaxAmount", "LineTotalIncludingTax") FROM stdin;
\.


--
-- Data for Name: supplier_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.supplier_payments ("Id", "PaymentNumber", "SupplierId", "PaymentDate", "Amount", "PaymentMethod", "Reference", "AllocatedAmount", "UnallocatedAmount", "Status", "CurrencyCode", "Notes", "CreatedAt", "UpdatedAt", allocated_amount, deleted_at) FROM stdin;
e676a32c-b433-44b2-abcd-6fb7e46556c0	PAY-000001	bc489975-0afd-459b-8b09-51de6ad24072	2026-01-01 03:00:00+03	500000.000000	CASH	\N	500000.000000	0.000000	COMPLETED	USD	Payment for SBILL-2026-0001	2026-01-02 00:27:35.79406+03	2026-01-02 00:27:35.79406+03	0.00	\N
\.


--
-- Data for Name: supplier_payment_allocations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.supplier_payment_allocations ("Id", "PaymentId", "SupplierInvoiceId", "AmountAllocated", "AllocationDate", "Notes", deleted_at) FROM stdin;
bc15eff8-3108-4e46-ad64-d37e65818591	e676a32c-b433-44b2-abcd-6fb7e46556c0	1588398c-0ee6-4467-8bf7-a3b1e58ac6fc	500000.000000	2026-01-02 00:27:35.79406+03	\N	\N
\.


--
-- Data for Name: system_backups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_backups (id, backup_number, file_name, file_path, file_size, checksum, backup_type, status, reason, created_by, created_by_name, created_at, verified_at, verified_by, is_verified, last_restored_at, last_restored_by, restore_count, stats_snapshot, is_deleted, deleted_at, deleted_by) FROM stdin;
2cc6b0f6-b363-45a2-b7c0-5fe40e0cdf80	BACKUP-2025-0002	backup_2025-12-27_15-24-41.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-27_15-24-41.dump	690651	9267347e25bbd9db938f4a943f99f0fa177d2f239ac3ad55aa8fcaf0861c1b42	FULL	COMPLETED	Pre-reset safety backup	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	2025-12-27 18:24:42.339153+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 10, "users": 8, "accounts": 27, "products": 19, "customers": 17, "suppliers": 3, "product_uoms": 26, "bank_accounts": 3, "customer_groups": 2, "expense_categories": 13}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 114, "ledger_entries": 414, "journal_entries": 0, "journal_entry_lines": 0, "ledger_transactions": 113, "payment_allocations": 0}, "transactionalData": {"sales": 96, "expenses": 4, "invoices": 16, "quotations": 3, "sale_items": 138, "cost_layers": 12, "goods_receipts": 4, "delivery_orders": 0, "purchase_orders": 4, "quotation_items": 5, "stock_movements": 146, "customer_deposits": 0, "customer_payments": 2, "inventory_batches": 22, "supplier_invoices": 5, "supplier_payments": 4, "invoice_line_items": 0, "goods_receipt_items": 9, "deposit_applications": 0, "purchase_order_items": 9, "supplier_payment_allocations": 4}}	t	2025-12-27 18:30:47.926605+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
a018e616-322f-41ac-8bf6-9388ed544663	BACKUP-2025-0001	backup_2025-12-27_15-06-23.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-27_15-06-23.dump	688377	11844827af6d9e56e4e42690e446a121ee4b78069d5df6b68290b8ea50e3e3ab	FULL	VERIFIED	Testing backup functionality	7aa55a55-db98-4a9d-a743-d877c7d8dd21	System Administrator	2025-12-27 18:06:24.05332+03	2025-12-27 18:22:55.845237+03	\N	t	\N	\N	0	{"masterData": {"uoms": 10, "users": 8, "accounts": 27, "products": 19, "customers": 17, "suppliers": 3, "product_uoms": 26, "bank_accounts": 3, "customer_groups": 2, "expense_categories": 13}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 114, "ledger_entries": 414, "journal_entries": 0, "journal_entry_lines": 0, "ledger_transactions": 113, "payment_allocations": 0}, "transactionalData": {"sales": 96, "expenses": 4, "invoices": 16, "quotations": 3, "sale_items": 138, "cost_layers": 12, "goods_receipts": 4, "delivery_orders": 0, "purchase_orders": 4, "quotation_items": 5, "stock_movements": 146, "customer_deposits": 0, "customer_payments": 2, "inventory_batches": 22, "supplier_invoices": 5, "supplier_payments": 4, "invoice_line_items": 0, "goods_receipt_items": 9, "deposit_applications": 0, "purchase_order_items": 9, "supplier_payment_allocations": 4}}	t	2025-12-28 12:56:48.322011+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
49b1365e-95d9-4afa-b789-b767e2f7ec5d	BACKUP-2025-0003	backup_2025-12-27_15-30-17.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-27_15-30-17.dump	691773	699f94a730b6be087750cbac56d30009ab44ef1d37e55b92e859d8a61cf8cbd8	FULL	VERIFIED	testing backapping	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-27 18:30:18.42298+03	2025-12-27 18:31:07.392317+03	\N	t	\N	\N	0	{"masterData": {"uoms": 10, "users": 8, "accounts": 27, "products": 19, "customers": 17, "suppliers": 3, "product_uoms": 26, "bank_accounts": 3, "customer_groups": 2, "expense_categories": 13}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 115, "ledger_entries": 416, "journal_entries": 0, "journal_entry_lines": 0, "ledger_transactions": 114, "payment_allocations": 0}, "transactionalData": {"sales": 97, "expenses": 4, "invoices": 16, "quotations": 3, "sale_items": 139, "cost_layers": 12, "goods_receipts": 4, "delivery_orders": 0, "purchase_orders": 4, "quotation_items": 5, "stock_movements": 147, "customer_deposits": 0, "customer_payments": 2, "inventory_batches": 22, "supplier_invoices": 5, "supplier_payments": 4, "invoice_line_items": 0, "goods_receipt_items": 9, "deposit_applications": 0, "purchase_order_items": 9, "supplier_payment_allocations": 4}}	t	2025-12-28 12:56:51.998854+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
17b0135c-5e9e-47c7-804b-2dc60d45c04f	BACKUP-2025-0004	backup_2025-12-27_15-32-01.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-27_15-32-01.dump	691958	3a08519715abcd580f3d640b5fe1623a38d390fa66a9a4d991a07a537113a100	FULL	VERIFIED	Pre-reset backup: testing resources	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-27 18:32:01.626846+03	2025-12-27 18:45:34.140841+03	\N	t	\N	\N	0	{"masterData": {"uoms": 10, "users": 8, "accounts": 27, "products": 19, "customers": 17, "suppliers": 3, "product_uoms": 26, "bank_accounts": 3, "customer_groups": 2, "expense_categories": 13}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 115, "ledger_entries": 416, "journal_entries": 0, "journal_entry_lines": 0, "ledger_transactions": 114, "payment_allocations": 0}, "transactionalData": {"sales": 97, "expenses": 4, "invoices": 16, "quotations": 3, "sale_items": 139, "cost_layers": 12, "goods_receipts": 4, "delivery_orders": 0, "purchase_orders": 4, "quotation_items": 5, "stock_movements": 147, "customer_deposits": 0, "customer_payments": 2, "inventory_batches": 22, "supplier_invoices": 5, "supplier_payments": 4, "invoice_line_items": 0, "goods_receipt_items": 9, "deposit_applications": 0, "purchase_order_items": 9, "supplier_payment_allocations": 4}}	t	2025-12-28 12:56:56.03191+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
4d14bad6-0344-4627-9ffc-00b453c81040	BACKUP-2025-0005	backup_2025-12-27_15-44-47.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-27_15-44-47.dump	618729	b447b54c69e22cf00f5ab5d2630a5dee9ff8fc7a2496e94fdd6898e8fe3a6d2c	FULL	VERIFIED	Pre-reset backup: TESTING   FULL	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-27 18:44:48.604258+03	2025-12-27 18:45:33.101349+03	\N	t	\N	\N	0	{"masterData": {"uoms": 10, "users": 8, "accounts": 27, "products": 19, "customers": 17, "suppliers": 3, "product_uoms": 26, "bank_accounts": 3, "customer_groups": 2, "expense_categories": 13}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 0, "ledger_entries": 0, "journal_entries": 0, "journal_entry_lines": 0, "ledger_transactions": 0, "payment_allocations": 0}, "transactionalData": {"sales": 0, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "user_sessions": 490, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 1, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 4, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-28 12:56:58.814579+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
f12526d1-13fc-4ff8-9b95-453c5428e49b	BACKUP-2025-0007	backup_2025-12-28_07-03-04.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-28_07-03-04.dump	606027	69dc3d947574f9401c00c18d11402958a31759aa5cfafecd3dd6dd1828e7adc0	FULL	COMPLETED	Pre-reset backup: remove it now for learning ourpases	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-28 10:03:06.4497+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 10, "users": 8, "accounts": 27, "products": 19, "customers": 17, "suppliers": 1, "product_uoms": 26, "bank_accounts": 3, "customer_groups": 2, "expense_categories": 13}, "databaseSize": "18 MB", "accountingData": {"payment_lines": 2, "ledger_entries": 16, "journal_entries": 0, "journal_entry_lines": 0, "ledger_transactions": 6, "payment_allocations": 0}, "transactionalData": {"sales": 2, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 2, "cost_layers": 3, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 7, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 3, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 1, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 3, "inventory_snapshots": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 3, "pos_customer_deposits": 1, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 1, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 1}}	t	2025-12-28 12:57:05.198241+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
5c7769af-b6cf-40ed-8d93-b7abaf1fb064	BACKUP-2025-0008	backup_2025-12-28_07-03-49.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-28_07-03-49.dump	600508	50685d4e6ea136eefeea3ed9c187de9916325278a614bfad301e3c033fc62a02	FULL	COMPLETED	Pre-reset backup: CLEAR ALLDATA	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-28 10:03:50.446889+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 10, "users": 8, "accounts": 27, "products": 19, "customers": 17, "suppliers": 1, "product_uoms": 26, "bank_accounts": 3, "customer_groups": 2, "expense_categories": 13}, "databaseSize": "18 MB", "accountingData": {"payment_lines": 0, "ledger_entries": 0, "journal_entries": 0, "journal_entry_lines": 0, "ledger_transactions": 0, "payment_allocations": 0}, "transactionalData": {"sales": 0, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-28 12:57:08.590461+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
e2ae6e75-6996-4bc9-b041-b58b033b29e4	BACKUP-2025-0006	backup_2025-12-27_19-40-38.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-27_19-40-38.dump	602020	b42ebf62f1c5c052e0f9a42629a095dc91b545e4069906fb2f4de6cfb7dc6e2a	FULL	COMPLETED	Pre-reset backup: testing ground	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-27 22:40:39.339131+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 10, "users": 8, "accounts": 27, "products": 19, "customers": 17, "suppliers": 1, "product_uoms": 26, "bank_accounts": 3, "customer_groups": 2, "expense_categories": 13}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 1, "ledger_entries": 6, "journal_entries": 0, "journal_entry_lines": 0, "ledger_transactions": 2, "payment_allocations": 0}, "transactionalData": {"sales": 1, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 1, "cost_layers": 3, "report_runs": 0, "stock_counts": 0, "user_sessions": 7, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 5, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 3, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 3, "inventory_snapshots": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 3, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-28 12:57:01.925957+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
71d87545-570e-4e64-8ab0-30a0a1a25dda	BACKUP-2025-0010	backup_2025-12-28_10-35-04.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-28_10-35-04.dump	618808	28e09c028ea375f2ef0eba24f6d1273d8752a0ff6a1bc553075f2fd82f4afd83	FULL	COMPLETED	Pre-reset backup: testing again	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-28 13:35:05.600419+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 8, "accounts": 27, "products": 21, "customers": 17, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "customer_groups": 2, "expense_categories": 13}, "databaseSize": "18 MB", "accountingData": {"payment_lines": 0, "ledger_entries": 4, "journal_entries": 0, "journal_entry_lines": 0, "ledger_transactions": 2, "payment_allocations": 0}, "transactionalData": {"sales": 0, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 0, "cost_layers": 1, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 1, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 1, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 1, "inventory_snapshots": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 1, "pos_customer_deposits": 1, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-29 20:12:31.279091+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
1c7a75e2-c1f3-4081-a795-7796e8783bf2	BACKUP-2025-0009	backup_2025-12-28_10-34-22.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-28_10-34-22.dump	618618	8c60744a55e51d0c916a4796d3581b195c962a3143292b8d814b107f4e0cf07c	FULL	VERIFIED	testing backaping	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-28 13:34:23.47002+03	2025-12-28 13:34:28.108408+03	\N	t	\N	\N	0	{"masterData": {"uoms": 11, "users": 8, "accounts": 27, "products": 21, "customers": 17, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "customer_groups": 2, "expense_categories": 13}, "databaseSize": "18 MB", "accountingData": {"payment_lines": 0, "ledger_entries": 4, "journal_entries": 0, "journal_entry_lines": 0, "ledger_transactions": 2, "payment_allocations": 0}, "transactionalData": {"sales": 0, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 0, "cost_layers": 1, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 1, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 1, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 1, "inventory_snapshots": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 1, "pos_customer_deposits": 1, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-29 20:12:33.789717+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
412222db-7efd-44c3-bf71-540b0dd5d9c2	BACKUP-2025-0014	backup_2025-12-29_17-12-07.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-29_17-12-07.dump	737218	6b5519964304624ff9780f63fe23f062d91a1a697ef547c3d4d5e7e26f0d72a6	FULL	COMPLETED	EMPTY DATABASE 1	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-29 20:12:08.242406+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 9, "accounts": 28, "products": 21, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "bank_patterns": 0, "bank_templates": 0, "bank_categories": 14, "customer_groups": 2, "expense_categories": 13, "bank_recurring_rules": 0}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 0, "ledger_entries": 0, "journal_entries": 0, "accounting_periods": 0, "journal_entry_lines": 0, "ledger_transactions": 0, "payment_allocations": 0, "manual_journal_entries": 0, "accounting_period_history": 0, "manual_journal_entry_lines": 0}, "transactionalData": {"sales": 0, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 0, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-29 20:12:12.713435+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
be5b54af-0796-44a7-95e9-47ea8cd48ec1	BACKUP-2025-0013	backup_2025-12-29_17-06-04.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-29_17-06-04.dump	737386	e39988a6b7fbdcf23568b65c80fe059d22cc9fcf1063f962ed24afa3ee3489db	FULL	COMPLETED	Pre-reset backup: cleare data now	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-29 20:06:05.428145+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 9, "accounts": 28, "products": 21, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "bank_patterns": 0, "bank_templates": 0, "bank_categories": 14, "customer_groups": 2, "expense_categories": 13, "bank_recurring_rules": 0}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 0, "ledger_entries": 0, "journal_entries": 0, "accounting_periods": 0, "journal_entry_lines": 0, "ledger_transactions": 0, "payment_allocations": 0, "manual_journal_entries": 2, "accounting_period_history": 0, "manual_journal_entry_lines": 4}, "transactionalData": {"sales": 0, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 0, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-29 20:12:17.544+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
25d1a75b-5b97-49de-9622-3abdd82de7e5	BACKUP-2025-0012	backup_2025-12-29_17-00-31.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-29_17-00-31.dump	746188	c51ca2d0c8dd6d479b24d11d9a6020f2bf8d31cd165be8ab6c4150e1fa9e07bf	FULL	COMPLETED	Pre-reset backup: testing again	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-29 20:00:32.263094+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 9, "accounts": 28, "products": 21, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "bank_patterns": 0, "bank_templates": 0, "bank_categories": 14, "customer_groups": 2, "expense_categories": 13, "bank_recurring_rules": 0}, "databaseSize": "20 MB", "accountingData": {"payment_lines": 4, "ledger_entries": 38, "journal_entries": 0, "accounting_periods": 12, "journal_entry_lines": 0, "ledger_transactions": 15, "payment_allocations": 0, "accounting_period_history": 0}, "transactionalData": {"sales": 4, "expenses": 2, "invoices": 0, "quotations": 0, "sale_items": 4, "bank_alerts": 0, "cost_layers": 2, "report_runs": 0, "stock_counts": 0, "user_sessions": 5, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 10, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 4, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 2, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 2, "inventory_snapshots": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 2, "pos_customer_deposits": 1, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-29 20:12:20.589641+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
5bbbaac5-18ed-447f-8142-f5aff48b477b	BACKUP-2025-0011	backup_2025-12-28_18-04-16.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-28_18-04-16.dump	687355	bf174bab83dc8e81a2e333a7f290318a6f389a3073634b6f80bd7d09a28a76cd	FULL	COMPLETED	Pre-reset backup: clear the test data	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-28 21:04:17.180298+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 8, "accounts": 27, "products": 21, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "customer_groups": 2, "expense_categories": 13}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 2, "ledger_entries": 8, "journal_entries": 0, "journal_entry_lines": 0, "ledger_transactions": 3, "payment_allocations": 0}, "transactionalData": {"sales": 1, "expenses": 0, "invoices": 1, "quotations": 0, "sale_items": 1, "cost_layers": 1, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 3, "customer_credits": 0, "invoice_payments": 1, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 1, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 1, "inventory_snapshots": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 1, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-29 20:12:28.487333+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
625edca6-7849-40a1-a4ae-17aa75723a27	BACKUP-2025-0015	backup_2025-12-29_17-12-49.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-29_17-12-49.dump	737390	36880109cd0149d31d416b0adac3f91fff1da4cbb5f18b66d00772352aaa614d	FULL	COMPLETED	EMPTY DATABASE 1	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-29 20:12:50.195109+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 9, "accounts": 28, "products": 21, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "bank_patterns": 0, "bank_templates": 0, "bank_categories": 14, "customer_groups": 2, "expense_categories": 13, "bank_recurring_rules": 0}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 0, "ledger_entries": 0, "journal_entries": 0, "accounting_periods": 0, "journal_entry_lines": 0, "ledger_transactions": 0, "payment_allocations": 0, "manual_journal_entries": 0, "accounting_period_history": 0, "manual_journal_entry_lines": 0}, "transactionalData": {"sales": 0, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 0, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-31 23:39:19.915709+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
6aa59adf-a8c9-4df5-8eaa-5795892e3532	BACKUP-2025-0019	backup_2025-12-31_11-37-04.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-31_11-37-04.dump	771531	712ccd4fc3db239ad7e031e83113a7113708745f4883865b1f968cef67973f66	FULL	COMPLETED	Pre-reset backup: bfgfghgmkghfghgg,hjhkt;uoui	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-31 14:37:06.041033+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 9, "accounts": 32, "products": 23, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "bank_patterns": 0, "bank_templates": 0, "bank_categories": 14, "customer_groups": 2, "expense_categories": 13, "bank_recurring_rules": 0}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 1, "ledger_entries": 12, "journal_entries": 0, "accounting_periods": 0, "journal_entry_lines": 0, "ledger_transactions": 6, "payment_allocations": 0, "manual_journal_entries": 0, "accounting_period_history": 0, "manual_journal_entry_lines": 0}, "transactionalData": {"sales": 1, "expenses": 3, "invoices": 1, "quotations": 1, "sale_items": 1, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 1, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 1, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 1, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 1, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-31 23:39:11.535226+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
9e9d831e-d71c-4ed1-8762-f179e4d9ca0c	BACKUP-2025-0018	backup_2025-12-31_09-56-31.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-31_09-56-31.dump	762958	6737fcb14bd21cbe6b4471388b44ae855cf6ea390e569345e61d0f157adf6233	FULL	COMPLETED	Pre-reset backup: bvbfggfdjjghkjfktryturet	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-31 12:56:33.084156+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 9, "accounts": 32, "products": 23, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "bank_patterns": 0, "bank_templates": 0, "bank_categories": 14, "customer_groups": 2, "expense_categories": 13, "bank_recurring_rules": 0}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 3, "ledger_entries": 8, "journal_entries": 0, "accounting_periods": 0, "journal_entry_lines": 0, "ledger_transactions": 4, "payment_allocations": 0, "manual_journal_entries": 0, "accounting_period_history": 0, "manual_journal_entry_lines": 0}, "transactionalData": {"sales": 3, "expenses": 1, "invoices": 3, "quotations": 3, "sale_items": 3, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "user_sessions": 4, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 3, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 3, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 7, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-31 23:39:14.95539+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
0aee3468-daf2-466d-84f0-ebcc8ce9e7fa	BACKUP-2025-0017	backup_2025-12-30_22-17-18.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-30_22-17-18.dump	764061	3c59ea9ed15d896ae99350a73e1372833c0f81381bae28104f7b7f8c31b37c35	FULL	COMPLETED	Pre-reset backup: gjhgkjhgkljhlkjh	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-31 01:17:20.39075+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 9, "accounts": 32, "products": 23, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "bank_patterns": 0, "bank_templates": 0, "bank_categories": 14, "customer_groups": 2, "expense_categories": 13, "bank_recurring_rules": 0}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 11, "ledger_entries": 53, "journal_entries": 0, "accounting_periods": 0, "journal_entry_lines": 0, "ledger_transactions": 16, "payment_allocations": 0, "manual_journal_entries": 0, "accounting_period_history": 0, "manual_journal_entry_lines": 0}, "transactionalData": {"sales": 14, "expenses": 0, "invoices": 0, "quotations": 3, "sale_items": 22, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 1, "purchase_orders": 0, "quotation_items": 5, "stock_movements": 21, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 1, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 1, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 5, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-31 23:39:17.460704+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
34087ee3-acac-4080-98c1-41a118799839	BACKUP-2025-0016	backup_2025-12-29_20-48-01.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-29_20-48-01.dump	750274	584ad47d0b352ff660db3dd0f84836b4bb9f5ab1ae7ffc9ce22d0a0307b659f3	FULL	COMPLETED	Pre-reset backup: tested and cleared	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-29 23:48:02.826129+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 9, "accounts": 32, "products": 21, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "bank_patterns": 0, "bank_templates": 0, "bank_categories": 14, "customer_groups": 2, "expense_categories": 13, "bank_recurring_rules": 0}, "databaseSize": "19 MB", "accountingData": {"payment_lines": 4, "ledger_entries": 22, "journal_entries": 0, "accounting_periods": 0, "journal_entry_lines": 0, "ledger_transactions": 7, "payment_allocations": 0, "manual_journal_entries": 0, "accounting_period_history": 0, "manual_journal_entry_lines": 0}, "transactionalData": {"sales": 4, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 4, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 13, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 1, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 1, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 2, "quotation_status_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	t	2025-12-31 23:39:24.548975+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
45f98af3-0294-4609-a2f2-7024c7950e54	BACKUP-2025-0020	backup_2025-12-31_20-40-37.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2025-12-31_20-40-37.dump	805934	4ebac88d5e0d2628b4c014721d941f74d1c8eecd4e6fd47aca99a29fd8825037	FULL	COMPLETED	Pre-reset backup: cxvbfngfdnemhr,hjfh	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2025-12-31 23:40:38.639678+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 9, "accounts": 32, "products": 23, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "bank_patterns": 0, "bank_templates": 0, "bank_categories": 14, "customer_groups": 2, "expense_categories": 13, "bank_recurring_rules": 0}, "databaseSize": "20 MB", "accountingData": {"payment_lines": 5, "ledger_entries": 36, "journal_entries": 0, "accounting_periods": 0, "journal_entry_lines": 0, "ledger_transactions": 16, "payment_allocations": 0, "manual_journal_entries": 0, "accounting_period_history": 0, "manual_journal_entry_lines": 0}, "transactionalData": {"sales": 4, "expenses": 1, "invoices": 3, "quotations": 2, "sale_items": 4, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 2, "purchase_orders": 0, "quotation_items": 2, "stock_movements": 7, "customer_credits": 0, "invoice_payments": 3, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 2, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 1, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 1, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 2, "purchase_order_items": 0, "pos_customer_deposits": 2, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 2, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	f	\N	\N
318c5d25-dcaf-44b6-9c92-d1b0a0c0b2df	BACKUP-2026-0001	backup_2026-01-01_19-45-23.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2026-01-01_19-45-23.dump	808263	3bd5d1d1fe22d9b0de71dc94403acb8e4988fb5f6a72b97cfa5c7b3c5f5523d9	FULL	COMPLETED	Pre-reset backup: vfkjhdfkzdljghrluih	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2026-01-01 22:45:26.070013+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 10, "accounts": 35, "products": 23, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "bank_patterns": 0, "bank_templates": 0, "cash_registers": 6, "bank_categories": 14, "customer_groups": 2, "expense_categories": 13, "bank_recurring_rules": 0}, "databaseSize": "20 MB", "accountingData": {"payment_lines": 6, "ledger_entries": 90, "journal_entries": 0, "accounting_periods": 0, "journal_entry_lines": 0, "ledger_transactions": 29, "payment_allocations": 0, "manual_journal_entries": 0, "accounting_period_history": 0, "manual_journal_entry_lines": 0}, "transactionalData": {"sales": 17, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 16, "bank_alerts": 0, "cost_layers": 6, "report_runs": 0, "stock_counts": 0, "user_sessions": 18, "cash_movements": 51, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 38, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 6, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "cash_register_sessions": 22, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}}	f	\N	\N
a0e9c2f4-40be-46f8-9d87-6a16ecf1abe3	BACKUP-2026-0002	backup_2026-01-01_21-21-21.dump	C:\\Users\\Chase\\source\\repos\\SamplePOS\\SamplePOS.Server\\backups\\backup_2026-01-01_21-21-21.dump	796637	805a1e261440e536c04e6cace0b8076cf7fe3b9c05e8c311b431a59ac46dbfd4	FULL	COMPLETED	Pre-reset backup: khvkkvhjvkjhvkjhvkj	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	2026-01-02 00:21:22.232844+03	\N	\N	f	\N	\N	0	{"masterData": {"uoms": 11, "users": 10, "accounts": 35, "products": 23, "customers": 18, "suppliers": 3, "product_uoms": 30, "bank_accounts": 3, "bank_patterns": 0, "bank_templates": 0, "cash_registers": 6, "bank_categories": 14, "customer_groups": 2, "expense_categories": 13, "bank_recurring_rules": 0}, "databaseSize": "20 MB", "accountingData": {"payment_lines": 2, "ledger_entries": 14, "journal_entries": 0, "accounting_periods": 0, "journal_entry_lines": 0, "ledger_transactions": 5, "payment_allocations": 0, "manual_journal_entries": 0, "accounting_period_history": 0, "manual_journal_entry_lines": 0}, "transactionalData": {"sales": 2, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 2, "bank_alerts": 0, "cost_layers": 2, "report_runs": 0, "stock_counts": 0, "user_sessions": 0, "cash_movements": 3, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 8, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 2, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 1, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 2, "inventory_snapshots": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 2, "pos_customer_deposits": 0, "quotation_attachments": 0, "cash_register_sessions": 2, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 1}}	f	\N	\N
\.


--
-- Data for Name: system_maintenance_mode; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_maintenance_mode (id, is_active, reason, operation_type, started_at, started_by, expected_duration_minutes, ended_at, ended_by) FROM stdin;
00000000-0000-0000-0000-000000000001	f	System reset in progress: khvkkvhjvkjhvkjhvkj	RESET	2026-01-02 00:21:22.241086+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf	\N	2026-01-02 00:21:22.854182+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
\.


--
-- Data for Name: system_reset_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_reset_log (id, reset_number, reset_type, backup_id, backup_number, authorized_by, authorized_by_name, confirmation_phrase, reason, started_at, completed_at, status, tables_cleared, records_deleted, balances_reset, error_message, rollback_reason, ip_address, user_agent, session_id) FROM stdin;
8f593a37-065e-41ab-9933-9497427d76d6	RESET-2025-0001	TRANSACTIONS_ONLY	17b0135c-5e9e-47c7-804b-2dc60d45c04f	BACKUP-2025-0004	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	testing resources	2025-12-27 18:32:01.63276+03	2025-12-27 18:32:01.760181+03	COMPLETED	{"sales": 97, "expenses": 4, "invoices": 16, "quotations": 3, "sale_items": 139, "cost_layers": 12, "report_runs": 0, "stock_counts": 12, "payment_lines": 115, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 4, "ledger_entries": 416, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 1, "purchase_orders": 4, "quotation_items": 5, "stock_movements": 147, "customer_credits": 0, "invoice_payments": 52, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_deposits": 0, "customer_payments": 2, "expense_approvals": 0, "expense_documents": 0, "inventory_batches": 22, "stock_count_lines": 108, "supplier_invoices": 5, "supplier_payments": 4, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 9, "inventory_snapshots": 0, "journal_entry_lines": 0, "ledger_transactions": 114, "payment_allocations": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 1, "purchase_order_items": 9, "pos_customer_deposits": 3, "quotation_attachments": 0, "delivery_status_history": 0, "pos_deposit_applications": 7, "quotation_status_history": 6, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 4}	1321	{"accounts": 9, "customers": 3, "inventory": 0, "suppliers": 0}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
5fca25e4-8e19-40f6-a794-f7dba863a50f	RESET-2025-0002	TRANSACTIONS_ONLY	4d14bad6-0344-4627-9ffc-00b453c81040	BACKUP-2025-0005	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	TESTING   FULL	2025-12-27 18:44:48.610847+03	2025-12-27 18:44:48.830655+03	COMPLETED	{"sales": 0, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 0, "user_sessions": 490, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "ledger_entries": 0, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 1, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 4, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "journal_entry_lines": 0, "ledger_transactions": 0, "payment_allocations": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}	495	{"accounts": 0, "customers": 0, "inventory": 0, "suppliers": 0}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
024d8b54-4da2-47e2-aa7e-72f2a4ff4940	RESET-2025-0003	TRANSACTIONS_ONLY	e2ae6e75-6996-4bc9-b041-b58b033b29e4	BACKUP-2025-0006	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	testing ground	2025-12-27 22:40:39.344483+03	2025-12-27 22:40:40.146164+03	COMPLETED	{"sales": 1, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 1, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 1, "user_sessions": 7, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "ledger_entries": 6, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 5, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 3, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 3, "inventory_snapshots": 0, "journal_entry_lines": 0, "ledger_transactions": 2, "payment_allocations": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 3, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}	35	{"accounts": 5, "customers": 0, "inventory": 3, "suppliers": 1}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
f8f2d98d-c0f0-470f-b538-ffa728f98ec2	RESET-2025-0004	TRANSACTIONS_ONLY	f12526d1-13fc-4ff8-9b95-453c5428e49b	BACKUP-2025-0007	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	remove it now for learning ourpases	2025-12-28 10:03:06.471896+03	2025-12-28 10:03:07.83202+03	COMPLETED	{"sales": 2, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 2, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 2, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "ledger_entries": 16, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 7, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 3, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 1, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 3, "inventory_snapshots": 0, "journal_entry_lines": 0, "ledger_transactions": 6, "payment_allocations": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 3, "pos_customer_deposits": 1, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 1, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 1}	51	{"accounts": 6, "customers": 0, "inventory": 3, "suppliers": 1}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
26d7a67c-4e00-442e-9604-e0d27c3f292a	RESET-2025-0005	TRANSACTIONS_ONLY	5c7769af-b6cf-40ed-8d93-b7abaf1fb064	BACKUP-2025-0008	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	CLEAR ALLDATA	2025-12-28 10:03:50.45864+03	2025-12-28 10:03:51.987775+03	COMPLETED	{"sales": 0, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "ledger_entries": 0, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "journal_entry_lines": 0, "ledger_transactions": 0, "payment_allocations": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}	0	{"accounts": 0, "customers": 0, "inventory": 0, "suppliers": 0}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
2faf8a66-b7d6-412c-b409-cc1e6f421af1	RESET-2025-0006	TRANSACTIONS_ONLY	71d87545-570e-4e64-8ab0-30a0a1a25dda	BACKUP-2025-0010	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	testing again	2025-12-28 13:35:05.604582+03	2025-12-28 13:35:06.356901+03	COMPLETED	{"sales": 0, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "ledger_entries": 4, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 1, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 1, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 1, "inventory_snapshots": 0, "journal_entry_lines": 0, "ledger_transactions": 2, "payment_allocations": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 1, "pos_customer_deposits": 1, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}	14	{"accounts": 4, "customers": 0, "inventory": 1, "suppliers": 1}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
fa82c09a-929f-48f0-8eea-a76665a38270	RESET-2025-0007	TRANSACTIONS_ONLY	5bbbaac5-18ed-447f-8142-f5aff48b477b	BACKUP-2025-0011	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	clear the test data	2025-12-28 21:04:17.186553+03	2025-12-28 21:04:17.786316+03	COMPLETED	{"sales": 1, "expenses": 0, "invoices": 1, "quotations": 0, "sale_items": 1, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 2, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "sale_discounts": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 3, "customer_credits": 0, "invoice_payments": 1, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 1, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 1, "inventory_snapshots": 0, "journal_entry_lines": 0, "payment_allocations": 0, "bank_reconciliations": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 1, "pos_customer_deposits": 0, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "accounting_complete_reset": 6, "bank_reconciliation_items": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0}	21	{"customers": 1, "inventory": 1, "suppliers": 1, "accounts_verified": 1, "accounts_complete_reset": 27}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
dc40b256-eb45-416e-a037-c237695f24ae	RESET-2025-0008	TRANSACTIONS_ONLY	25d1a75b-5b97-49de-9622-3abdd82de7e5	BACKUP-2025-0012	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	testing again	2025-12-29 20:00:32.268838+03	2025-12-29 20:00:32.82057+03	COMPLETED	{"sales": 4, "expenses": 2, "invoices": 0, "quotations": 0, "sale_items": 4, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 4, "user_sessions": 5, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 10, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 4, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 2, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 0, "accounting_periods": 12, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 2, "inventory_snapshots": 0, "journal_entry_lines": 0, "payment_allocations": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 2, "pos_customer_deposits": 1, "quotation_attachments": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "accounting_complete_reset": 6, "accounting_period_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "bank_account_balances_reset": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0, "customer_credits_gl_refs_cleared": 0, "bank_transactions_gl_refs_cleared": 4, "customer_deposits_gl_refs_cleared": 0, "credit_applications_gl_refs_cleared": 0, "deposit_applications_gl_refs_cleared": 0}	65	{"customers": 0, "inventory": 2, "suppliers": 1, "accounts_verified": 1, "accounts_complete_reset": 28}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
106c58d8-1d65-4f33-a63e-65b5ef45c61d	RESET-2025-0009	TRANSACTIONS_ONLY	be5b54af-0796-44a7-95e9-47ea8cd48ec1	BACKUP-2025-0013	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	cleare data now	2025-12-29 20:06:05.433639+03	2025-12-29 20:06:05.970131+03	COMPLETED	{"sales": 0, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 0, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 0, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "accounting_periods": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "journal_entry_lines": 0, "payment_allocations": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "manual_journal_entries": 2, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "accounting_complete_reset": 6, "accounting_period_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "manual_journal_entry_lines": 4, "bank_account_balances_reset": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0, "customer_credits_gl_refs_cleared": 0, "bank_transactions_gl_refs_cleared": 0, "customer_deposits_gl_refs_cleared": 0, "credit_applications_gl_refs_cleared": 0, "deposit_applications_gl_refs_cleared": 0}	12	{"customers": 0, "inventory": 0, "suppliers": 0, "accounts_verified": 1, "accounts_complete_reset": 28}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
66bcea76-c761-4cb0-a421-4c00ee6c4379	RESET-2025-0010	TRANSACTIONS_ONLY	34087ee3-acac-4080-98c1-41a118799839	BACKUP-2025-0016	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	tested and cleared	2025-12-29 23:48:02.830415+03	2025-12-29 23:48:03.410113+03	COMPLETED	{"sales": 4, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 4, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 4, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 13, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 1, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "accounting_periods": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "journal_entry_lines": 0, "payment_allocations": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 1, "quotation_attachments": 0, "manual_journal_entries": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 2, "quotation_status_history": 0, "accounting_complete_reset": 6, "accounting_period_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "manual_journal_entry_lines": 0, "bank_account_balances_reset": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0, "customer_credits_gl_refs_cleared": 0, "bank_transactions_gl_refs_cleared": 0, "customer_deposits_gl_refs_cleared": 0, "credit_applications_gl_refs_cleared": 0, "deposit_applications_gl_refs_cleared": 0}	35	{"customers": 0, "inventory": 1, "suppliers": 0, "accounts_verified": 1, "accounts_complete_reset": 32}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
0fb0cfca-16f5-4ceb-a4f7-77ea73643e95	RESET-2025-0011	TRANSACTIONS_ONLY	0aee3468-daf2-466d-84f0-ebcc8ce9e7fa	BACKUP-2025-0017	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	gjhgkjhgkljhlkjh	2025-12-31 01:17:20.403642+03	2025-12-31 01:17:21.624262+03	COMPLETED	{"sales": 14, "expenses": 0, "invoices": 0, "quotations": 3, "sale_items": 22, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 11, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 1, "purchase_orders": 0, "quotation_items": 5, "stock_movements": 21, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 1, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "accounting_periods": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "journal_entry_lines": 0, "payment_allocations": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 1, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "manual_journal_entries": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 5, "accounting_complete_reset": 6, "accounting_period_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "manual_journal_entry_lines": 0, "bank_account_balances_reset": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0, "customer_credits_gl_refs_cleared": 0, "bank_transactions_gl_refs_cleared": 0, "customer_deposits_gl_refs_cleared": 0, "credit_applications_gl_refs_cleared": 0, "deposit_applications_gl_refs_cleared": 0}	90	{"customers": 1, "inventory": 1, "suppliers": 0, "accounts_verified": 1, "accounts_complete_reset": 32}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
9543d8cd-5627-4ea6-9787-ffd8efeb9d1c	RESET-2025-0012	TRANSACTIONS_ONLY	9e9d831e-d71c-4ed1-8762-f179e4d9ca0c	BACKUP-2025-0018	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	bvbfggfdjjghkjfktryturet	2025-12-31 12:56:33.096976+03	2025-12-31 12:56:34.360113+03	COMPLETED	{"sales": 3, "expenses": 1, "invoices": 3, "quotations": 3, "sale_items": 3, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 3, "user_sessions": 4, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 3, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 3, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "accounting_periods": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "journal_entry_lines": 0, "payment_allocations": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "manual_journal_entries": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 7, "accounting_complete_reset": 6, "accounting_period_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "manual_journal_entry_lines": 0, "bank_account_balances_reset": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0, "customer_credits_gl_refs_cleared": 0, "bank_transactions_gl_refs_cleared": 0, "customer_deposits_gl_refs_cleared": 0, "credit_applications_gl_refs_cleared": 0, "deposit_applications_gl_refs_cleared": 0}	39	{"customers": 0, "inventory": 0, "suppliers": 0, "accounts_verified": 1, "accounts_complete_reset": 32}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
353001ba-574f-48ba-915d-5a25e39909e0	RESET-2025-0013	TRANSACTIONS_ONLY	6aa59adf-a8c9-4df5-8eaa-5795892e3532	BACKUP-2025-0019	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	bfgfghgmkghfghgg,hjhkt;uoui	2025-12-31 14:37:06.054858+03	2025-12-31 14:37:07.30129+03	COMPLETED	{"sales": 1, "expenses": 3, "invoices": 1, "quotations": 1, "sale_items": 1, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 1, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 1, "stock_movements": 0, "customer_credits": 0, "invoice_payments": 1, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 1, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 0, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "accounting_periods": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "journal_entry_lines": 0, "payment_allocations": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "manual_journal_entries": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 1, "accounting_complete_reset": 6, "accounting_period_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "manual_journal_entry_lines": 0, "bank_account_balances_reset": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0, "customer_credits_gl_refs_cleared": 0, "bank_transactions_gl_refs_cleared": 0, "customer_deposits_gl_refs_cleared": 0, "credit_applications_gl_refs_cleared": 0, "deposit_applications_gl_refs_cleared": 0}	18	{"customers": 0, "inventory": 0, "suppliers": 0, "accounts_verified": 1, "accounts_complete_reset": 32}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
c59aca9b-7edf-4a13-b221-4a794262451b	RESET-2025-0014	TRANSACTIONS_ONLY	45f98af3-0294-4609-a2f2-7024c7950e54	BACKUP-2025-0020	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	cxvbfngfdnemhr,hjfh	2025-12-31 23:40:38.652904+03	2025-12-31 23:40:39.79865+03	COMPLETED	{"sales": 4, "expenses": 1, "invoices": 3, "quotations": 2, "sale_items": 4, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 5, "user_sessions": 0, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 2, "purchase_orders": 0, "quotation_items": 2, "stock_movements": 7, "customer_credits": 0, "invoice_payments": 3, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 2, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 1, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 1, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "accounting_periods": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "journal_entry_lines": 0, "payment_allocations": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 2, "purchase_order_items": 0, "pos_customer_deposits": 2, "quotation_attachments": 0, "manual_journal_entries": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 2, "accounting_complete_reset": 6, "accounting_period_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "manual_journal_entry_lines": 0, "bank_account_balances_reset": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0, "customer_credits_gl_refs_cleared": 0, "bank_transactions_gl_refs_cleared": 2, "customer_deposits_gl_refs_cleared": 0, "credit_applications_gl_refs_cleared": 0, "deposit_applications_gl_refs_cleared": 0}	51	{"customers": 1, "inventory": 1, "suppliers": 0, "accounts_verified": 1, "accounts_complete_reset": 32}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
63498e03-14f8-41cd-82ff-645f912ed463	RESET-2026-0001	TRANSACTIONS_ONLY	318c5d25-dcaf-44b6-9c92-d1b0a0c0b2df	BACKUP-2026-0001	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	vfkjhdfkzdljghrluih	2026-01-01 22:45:26.08404+03	2026-01-01 22:45:27.72585+03	COMPLETED	{"sales": 17, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 16, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 6, "user_sessions": 18, "cash_movements": 51, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 0, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 0, "quotation_items": 0, "stock_movements": 38, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 6, "stock_count_lines": 0, "supplier_invoices": 0, "supplier_payments": 0, "accounting_periods": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 0, "inventory_snapshots": 0, "journal_entry_lines": 0, "payment_allocations": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 0, "pos_customer_deposits": 0, "quotation_attachments": 0, "cash_register_sessions": 22, "manual_journal_entries": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "accounting_complete_reset": 6, "accounting_period_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "manual_journal_entry_lines": 0, "bank_account_balances_reset": 3, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 0, "customer_credits_gl_refs_cleared": 0, "bank_transactions_gl_refs_cleared": 0, "customer_deposits_gl_refs_cleared": 0, "credit_applications_gl_refs_cleared": 0, "deposit_applications_gl_refs_cleared": 0}	183	{"customers": 0, "inventory": 4, "suppliers": 0, "accounts_verified": 1, "accounts_complete_reset": 35}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
071afcc8-28d9-4d08-a663-e2bf3ffad4bb	RESET-2026-0002	TRANSACTIONS_ONLY	a0e9c2f4-40be-46f8-9d87-6a16ecf1abe3	BACKUP-2026-0002	956f87a9-18cf-49ee-94b4-9c44a94a7faf	Test Admin	RESET ALL TRANSACTIONS	khvkkvhjvkjhvkjhvkj	2026-01-02 00:21:22.238803+03	2026-01-02 00:21:22.850177+03	COMPLETED	{"sales": 2, "expenses": 0, "invoices": 0, "quotations": 0, "sale_items": 2, "bank_alerts": 0, "cost_layers": 0, "report_runs": 0, "stock_counts": 0, "payment_lines": 2, "user_sessions": 0, "cash_movements": 3, "delivery_items": 0, "delivery_proof": 0, "goods_receipts": 1, "sale_discounts": 0, "bank_statements": 0, "delivery_orders": 0, "delivery_routes": 0, "journal_entries": 0, "pos_held_orders": 0, "purchase_orders": 1, "quotation_items": 0, "stock_movements": 8, "customer_credits": 0, "invoice_payments": 0, "processed_events": 0, "quotation_emails": 0, "route_deliveries": 0, "bank_transactions": 0, "cash_book_entries": 0, "customer_accounts": 0, "customer_deposits": 0, "customer_payments": 0, "expense_approvals": 0, "expense_documents": 0, "financial_periods": 0, "inventory_batches": 2, "stock_count_lines": 0, "supplier_invoices": 1, "supplier_payments": 1, "accounting_periods": 0, "invoice_line_items": 0, "cash_bank_transfers": 0, "credit_applications": 0, "failed_transactions": 0, "goods_receipt_items": 2, "inventory_snapshots": 0, "journal_entry_lines": 0, "payment_allocations": 0, "bank_reconciliations": 0, "bank_statement_lines": 0, "deposit_applications": 0, "payment_transactions": 0, "pos_held_order_items": 0, "purchase_order_items": 2, "pos_customer_deposits": 0, "quotation_attachments": 0, "cash_register_sessions": 2, "manual_journal_entries": 0, "delivery_status_history": 0, "discount_authorizations": 0, "pos_deposit_applications": 0, "quotation_status_history": 0, "accounting_complete_reset": 6, "accounting_period_history": 0, "bank_reconciliation_items": 0, "bank_transaction_patterns": 0, "manual_journal_entry_lines": 0, "bank_account_balances_reset": 0, "supplier_invoice_line_items": 0, "customer_balance_adjustments": 0, "supplier_payment_allocations": 1, "customer_credits_gl_refs_cleared": 0, "bank_transactions_gl_refs_cleared": 0, "customer_deposits_gl_refs_cleared": 0, "credit_applications_gl_refs_cleared": 0, "deposit_applications_gl_refs_cleared": 0}	36	{"customers": 0, "inventory": 2, "suppliers": 1, "accounts_verified": 1, "accounts_complete_reset": 35}	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0	\N
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_settings (id, business_name, currency_code, currency_symbol, date_format, time_format, timezone, tax_enabled, default_tax_rate, tax_name, tax_number, tax_inclusive, tax_rates, receipt_printer_enabled, receipt_printer_name, receipt_paper_width, receipt_auto_print, receipt_show_logo, receipt_logo_url, receipt_header_text, receipt_footer_text, receipt_show_tax_breakdown, receipt_show_qr_code, invoice_printer_enabled, invoice_printer_name, invoice_paper_size, invoice_template, invoice_show_logo, invoice_show_payment_terms, invoice_default_payment_terms, low_stock_alerts_enabled, low_stock_threshold, created_at, updated_at, updated_by_id) FROM stdin;
dbf0dbcd-2250-43ca-a6a1-1a7a9445c717	BLIZ INTERNATIONAL LTD	UGX	UGX	MM/DD/YYYY	24h	Africa/Kampala	f	18.00	VAT	\N	t	[]	t	\N	80	f	t	\N	\N	Thank you for your business!	t	f	t	\N	A4	standard	t	t	Payment due within 30 days	t	10	2025-11-16 20:28:19.702838+03	2026-01-03 00:06:34.404512+03	956f87a9-18cf-49ee-94b4-9c44a94a7faf
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_sessions (id, user_id, user_name, user_role, login_at, logout_at, session_duration_seconds, ip_address, user_agent, device_type, terminal_id, is_active, logout_reason, last_activity_at, actions_count, created_at, updated_at) FROM stdin;
\.


--
-- Name: backup_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.backup_number_seq', 2, true);


--
-- Name: bank_txn_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.bank_txn_number_seq', 4, true);


--
-- Name: customer_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_number_seq', 1, false);


--
-- Name: deposit_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.deposit_number_seq', 1, false);


--
-- Name: hold_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.hold_number_seq', 1, true);


--
-- Name: product_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_number_seq', 1, true);


--
-- Name: quotation_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.quotation_number_seq', 1, false);


--
-- Name: quotations_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.quotations_seq', 3, true);


--
-- Name: reset_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.reset_number_seq', 2, true);


--
-- Name: supplier_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.supplier_number_seq', 1, false);


--
-- Name: user_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_number_seq', 8, true);


--
-- PostgreSQL database dump complete
--

