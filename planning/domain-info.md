# domain-info.md — website-solution.net

Provider reference for the pricing-bot project. Facts below were read off the provider's
own plan pages on **2026-09-16**; anything marked _unverified_ still needs confirming with
the host. Prices are HKD unless stated.


## Our account (confirmed)

Source: the provider's account set-up email, plus the current plan confirmed by the owner on
**2026-09-26**. This section overrides anything in the general plan tables below.

| | |
|---|---|
| Domain | `protopintl.com` (website: http://www.protopintl.com) |
| Plan | **Plan C ×3 Web Hosting**, with domain registration |
| Status | Renewed (the set-up email's 2026-09-29 expiry no longer applies) |
| Product type | Real shared web hosting — DirectAdmin, FTP, PHP, MariaDB. **Not** a website builder |

Plan C ×3 is presumably three times the published Plan C (see the plan table below): about
120 GB disk, 600 GB/month bandwidth, 12 databases and 15 domains. **These are estimates**;
the provider doesn't say how multiples scale. Check the real figures in DirectAdmin.

> **Credentials are not kept in this file.** The DirectAdmin password in the original set-up
> email is out of date. Keep current passwords in a password manager.

### Control panel (DirectAdmin)

- URL: https://mango.website-solution.net:2222
- Username: `protopin`
- Used to manage email accounts, FTP, databases, DNS, PHP version, SSL, backups and cron.
- Two-factor login is available and should be turned on.

### Website files (FTP)

| | |
|---|---|
| Server | `ftp.protopintl.com`, port 21, passive mode |
| Encryption | Explicit FTP over TLS (use this; e.g. FileZilla's default) |
| Login | Same username and password as DirectAdmin |
| Web root | `/domains/protopintl.com/public_html/` |
| Home page | `index.html`, `index.htm` or `index.php` |

Don't delete the system folders `/domains/`, `/imap/` or `/Maildir/`.

To deploy the Astro site: run `npm run build`, then upload the contents of `dist/` into
`public_html/`.

### PHP and MySQL (MariaDB)

- **PHP** — version is selectable at the bottom of the DirectAdmin page (Apache handler).
- **Databases** — created under **MySQL Management** in DirectAdmin (Plan A and above; our
  plan qualifies). Within a database we have full control: create tables, indexes, etc.
- **phpMyAdmin** — https://protopintl-com.login.hk/phpMyAdmin
  (also http://www.protopintl.com/phpMyAdmin, unencrypted — avoid).

### Email

Log in with the **full email address** and that mailbox's password. Prefer the encrypted
connections.

| Service | Encrypted (recommended) | Unencrypted |
|---|---|---|
| IMAP (incoming) | `protopintl-com.login.hk`, port 993 | `mail.protopintl.com`, port 143 |
| POP3 (incoming) | `protopintl-com.login.hk`, port 995 | `mail.protopintl.com`, port 110 |
| SMTP (outgoing) | `protopintl-com.login.hk`, port 465 (SSL/TLS) or 587 (STARTTLS) | `mail.protopintl.com`, port 587 |
| Webmail | https://protopintl-com.login.hk/webmail | http://www.protopintl.com/webmail |

- SMTP authentication: same as incoming. On macOS/iOS choose "Password" and use an
  encrypted connection.
- IMAP keeps mail on the server (multiple devices); POP3 downloads it to one device.
- Some devices keep IMAP "Sent" items locally rather than on the server.

## Provider

|                 |                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Name            | 卓智互聯網服務有限公司 / Website Solution                                                           |
| Site            | https://www.website-solution.net                                                                    |
| Location        | Room 1617A, 16/F, Block B, Vigor Industrial Building, 1-15 Kwai Fung Crescent, Kwai Fong, Hong Kong |
| Operating since | 2002 (claims 20+ years, 5,000+ customers)                                                           |
| Phone           | (852) 2187-3707                                                                                     |
| Fax             | (852) 3007-1200                                                                                     |
| WhatsApp        | (852) 5519-3000                                                                                     |
| WeChat          | `website-solution`                                                                                  |
| Email           | info@website-solution.net · support@website-solution.net                                            |
| Office hours    | Mon–Fri 10:00–19:00 HKT                                                                             |
| Network         | Own ASN — "Website Solution AS56059 Network", BGP multi-route fibre                                 |
| Servers         | Hong Kong                                                                                           |

**Product lines:** web hosting (standard + SSD), SmarterMail email hosting, legacy email
hosting, FTP hosting (from $576/yr), VPS, dedicated servers, SSL/EV SSL, domain
registration with WHOIS privacy, and website builders (Weebly, Site Builder Pro, 創頁王 4.5
and 12).

**General terms:** 14-day money-back on web hosting, 創頁王, email, FTP and VPS (excludes
domain registration and WHOIS privacy). Free trials for web hosting, SmarterMail, FTP and
Weebly. Free migration assistance. All plans billed annually except VPS.

---

## Web hosting plans

> **These are the provider's publicly advertised plans.** Our account is on **Plan C ×3**
> (see "Our account" above). Treat these figures as general reference; the numbers that
> matter for our plan — especially the per-database size cap — should be checked in
> DirectAdmin.

| Spec                  | SOHO      | Plan A    | Plan B    | Plan C    |
| --------------------- | --------- | --------- | --------- | --------- |
| Monthly               | $30       | $50       | $90       | $150      |
| Annual                | $360      | $600      | $1,080    | $1,800    |
| Disk                  | 2.5 GB    | 10 GB     | 20 GB     | 40 GB     |
| Bandwidth/mo          | 12.5 GB   | 50 GB     | 100 GB    | 200 GB    |
| Email accounts        | 10        | 15        | 25        | 50        |
| Email forwarding      | Unlimited | Unlimited | Unlimited | Unlimited |
| Hostable domains      | 1         | 1         | 2         | 5         |
| Subdomains            | 5         | 5         | 10        | 20        |
| FTP accounts          | 5         | 5         | 10        | 20        |
| PHP                   | 8, 7      | 8, 7      | 8, 7      | 8, 7      |
| **MariaDB databases** | **none**  | **1**     | **2**     | **4**     |

Larger sizes sold as Plan C ×2, ×3, ×4.

### Stack

- Linux, Apache 2.4 with HTTP/2, mod_deflate, HTTP header caching
- PHP 8 and 7 (PHP 5 also referenced)
- MariaDB (i.e. MySQL-compatible)
- **DirectAdmin** control panel, with 2FA
- Free basic SSL; paid branded/EV SSL available; TLS 1.2 and 1.3
- POP3/IMAP, SMTP on port 587, webmail over SSL
- NIDS firewall + ModSecurity WAF

### Limits and exclusions — read before designing

- **Each MariaDB database capped at 200 MB** on the advertised plans. **Binding constraint
  for this project — and unconfirmed for the plan actually owned.** Caps like this are often
  plan-specific, grandfathered, or raisable on request, so this is worth checking directly
  rather than designing around the public figure. If the real cap is 200 MB it rules out
  storing email bodies in MariaDB; if it's several GB, the shared-hosting option becomes
  substantially more attractive. Verify before committing to an architecture.
- **Disk is shared across email + website + database** — mail eats the same quota.
- **Outbound SMTP capped at 500 messages/day** on port 587.
- **PHP is the only server-side language.** No cgi-bin, Perl, ASP, Java. No Python.
- **SSH not mentioned** for shared plans (listed only for VPS) — assume unavailable.
- No FrontPage Server Extensions; FTP publishing works.
- Backups kept ~5 days only (current day + previous 4). Not an audit trail.
- Prohibited use: forums, download sites, video download / high-load sites.
- Maintenance reboots 03:00–07:00, ~once monthly, ~5 minutes.

### Pricing extras

- Prepay 2 years −10%, 3 years −20%
- Plan B and above: free content/email migration (otherwise one-off $400) and a free 1-year
  .com/.net/.org registration, subject to availability
- Upgrades prorated (their example: $349 to go Plan A → Plan B after 100 days)
- No setup or handling fee to transfer in

### SSD vs standard

SSD plans marketed as ~4× faster than HDD (on-page graphic shows 100% vs 25%). No separate
spec table was captured — check the SSD plan page if performance matters.

---

## Email hosting (SmarterMail)

| Plan | Monthly | Annual | Accounts | Storage (shared pool) |
| ---- | ------- | ------ | -------- | --------------------- |
| S5   | $60     | $720   | 5        | 50 GB                 |
| S10  | $108    | $1,296 | 10       | 100 GB                |
| S15  | $154    | $1,847 | 15       | 150 GB                |
| S30  | $262    | $3,149 | 30       | 300 GB                |
| S50  | $354    | $4,252 | 50       | 500 GB                |
| S100 | $574    | $6,887 | 100      | 1,000 GB              |

Storage is a **shared pool across the domain**, not per mailbox. Higher tiers available.

### Protocols and access

- **POP3 and IMAP confirmed**; CalDAV and CardDAV for calendar/contact sync
- SMTP on port 587 (per the web hosting page)
- Webmail: multi-language, full-text search (English only), multiple sending identities,
  calendars, contacts, file storage / large-file links (English filenames only), video
  conferencing up to 8 participants
- **Hostnames and ports** — not on the public site, but confirmed for our account; see "Our account → Email"
- **SmarterMail version NOT published** — _unverified_. Current versions expose a REST API,
  which would be a better fit than IMAP polling. Confirm before designing around it.

### Limits

- **Sending capped at 250 messages/hour**; overflow queues server-side rather than bouncing
- Connection limits not stated — _unverified_
- CalDAV/CardDAV syncs personal calendars/contacts only, not shared ones. iOS native;
  Android needs third-party paid software.

### Security

- Antivirus: Cyren zero-hour, ClamAV with extra definitions, Windows Defender
- Antispam: Cyren Antispam, SpamAssassin with in-house rules, plus greylisting tuned for
  Hong Kong senders
- **2FA with app-generated passwords for Outlook** → app-specific credentials are available.
  Use these for the bot and per-user access instead of real mail passwords.
- SSL/TLS, SPF, DKIM, SRS, in-house suspicious-login detection

### Migration and trial

- One-off mail migration fee $400, waived once on S10 and above
- **Free 10-day trial:** test domain (e.g. `t1234.tryws.biz`), up to 5 mailboxes, 500 MB
  total, outbound mail to external servers blocked. Good for prototyping ingestion safely.

---

## VPS

|             | DA1                     | DA2                     |
| ----------- | ----------------------- | ----------------------- |
| Monthly     | **$728**                | **$1,078**              |
| Disk        | 250 GB (~237 GB usable) | 500 GB (~475 GB usable) |
| Transfer/mo | 320 GB                  | 640 GB                  |
| RAM         | 4,096 MB                | 8,192 MB                |
| IPs         | 1                       | 2                       |
| Panel       | DirectAdmin Standard    | DirectAdmin Standard    |

- **CPU:** no core count given; only "2.0G 或以上", resources evenly distributed
- **OS:** AlmaLinux 9.6 (only option listed)
- **Pre-installed:** DirectAdmin 1.5, Apache 2.4, PHP 8, Exim 4, MariaDB 10.6, ProFTPd, Bind 9
- **Root + SSH: yes.** Own root account, remote admin via SSH/PuTTY
- **Firewall:** CSF iptables; ports 20, 21, 22, 25, 53, 80, 110, 143, 443, 587, 993, 995,
  2222 open by default — IMAP/IMAPS work out of the box. Rule changes on request.
- **Backups:** daily incremental, kept 7 days; 2 free restores/month, then $500 each
- **Terms:** month-to-month, no contract, no prepayment, 1-month minimum
- **Managed?** Not stated. Leans self-managed (you hold root, install software, reboot at
  will) but the provider keeps an SSH root key pair for backups/monitoring/support and does
  restores during office hours.
- **Add-ons:** +1 GB RAM $100/mo · +4 GB storage $100/mo · extra IP $50/mo · dedicated
  1 Mb/s international bandwidth $1,280/mo (12-month contract). DirectAdmin Legacy saves
  $240/mo. Two IPs needed to run your own nameservers.
- **Notes:** AlmaLinux uses ~5 GB; reserve ~5% for XFS. Bandwidth figures are weekly MRTG
  averages, not hard caps.

**Value judgement:** technically ideal for this project, but priced as a managed
DirectAdmin reseller box — roughly **10–20× a commodity VPS** (Hetzner/DigitalOcean run
US$5–10 for this workload). Only choose it for single-vendor support or HK data residency.

---

## Resolved: static hosting vs. web hosting

Earlier project notes described the website as static HTML/CSS uploaded one file at a time
through an admin portal, which suggested a website-builder product. **That was wrong.** The
set-up email confirms a real web hosting account (DirectAdmin, FTP, PHP, MariaDB), now on
Plan C ×3. PHP-based features — including the website's contact form — are available.

## Not yet verified

Check these in DirectAdmin or with the host:

1. **Plan C ×3 limits** — number of databases, disk, and especially the **size cap per
   database** (200 MB on the published plans; may be higher or raisable).
2. **Cron jobs** — available under Advanced Features? Minimum interval?
3. **Outbound HTTPS from PHP** — are cURL / `allow_url_fopen` enabled? Required for API
   calls. A `phpinfo()` test page will show this.
4. **SmarterMail version, and is the REST API exposed?**
5. **App-specific passwords** — can they be issued per user?
6. **Is the 500/day outbound SMTP limit per domain or per mailbox?**
7. SSD plan specs and price delta vs. standard (only relevant if performance matters).

~~Which product the account is on~~ — answered: Plan C ×3 web hosting.
~~IMAP/SMTP hostnames and ports~~ — answered: see "Our account → Email".

## Sources

- https://www.website-solution.net — homepage / company details
- https://www.website-solution.net/web-hosting/ — plan table, stack, limits
- https://www.website-solution.net/email-hosting/ — SmarterMail plans, protocols, limits
- https://www.website-solution.net/vps/ — VPS specs and add-ons

- Account set-up email from the provider (account details), and plan confirmation from the owner, 2026-09-26

See `feasibility-and-plan.md` for what these constraints mean for the architecture.
