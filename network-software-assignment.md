# Network Software Components

[Your name] · [Class / course code] · [Date]

## Part A & B: 12 components

| # | Component | What it is | What it does | Examples | Where used |
|---|---|---|---|---|---|
| 1 | Network Operating System | An operating system made for servers that share resources with many users at once | Manages user accounts, shared files, printers and services, and keeps them running 24/7 | Windows Server 2022, Ubuntu Server, Red Hat Enterprise Linux | Business networks, server rooms; rarely at home |
| 2 | TCP/IP stack | The built-in set of rules every device uses to send data across a network | IP addresses and routes packets; TCP checks they arrive complete and in order (UDP sends fast with no checks) | The networking stack in Windows, macOS, Linux, Android, iOS | Everywhere: home, business, server room, internet |
| 3 | DHCP service | A service that hands out network settings automatically | Leases each device an IP address, subnet mask, gateway and DNS server | Home router DHCP, Windows Server DHCP role, dnsmasq / Kea | Home routers, business networks, server rooms |
| 4 | DNS service | The network's "phone book" | Turns names like google.com into IP addresses | Windows DNS Server, BIND, Cloudflare 1.1.1.1, Google 8.8.8.8 | Every network; businesses run their own for internal names |
| 5 | NAT software | Software in a router or firewall that rewrites addresses on packets | Lets many private devices share one public IP and hides the inside network | Home Wi-Fi routers, pfSense, Linux iptables / nftables | Almost every home and business connection |
| 6 | VPN software | Software that builds an encrypted "tunnel" across the internet | Lets remote workers or branch offices join a private network safely | WireGuard, OpenVPN, Cisco AnyConnect, Windows VPN | Businesses (remote work); home users (privacy) |
| 7 | Web server | Software that stores websites and sends pages to browsers | Answers HTTP/HTTPS requests on ports 80/443 with pages, images and app data | Apache, Nginx, Microsoft IIS | Server rooms, data centres, cloud; home labs |
| 8 | Authentication server | A central database of an organization's users, computers and passwords | Checks who you are at login and what you may open; one account works on every PC | Active Directory, Microsoft Entra ID, FreeIPA, RADIUS | Schools, businesses, server rooms |
| 9 | Firewall software | A security program that checks traffic against rules | Allows trusted traffic, blocks unwanted connections by IP, port or app | Windows Defender Firewall, pfSense, ufw / iptables, Palo Alto | Every home PC, business network edge, in front of servers |
| 10 | IDS / IPS | Systems that watch for attacks; IDS warns, IPS also blocks | Compares packets with known attack patterns and odd behaviour | Snort, Suricata, Zeek, Cisco Firepower | Business networks, server rooms |
| 11 | Wireshark | A free packet analyzer ("sniffer") | Captures and decodes packets so you can see what protocols are doing and fix problems | Wireshark, tcpdump | IT departments, classrooms, security teams |
| 12 | Remote access (SSH / RDP) | Tools to control another computer over the network | SSH: encrypted command line (port 22); RDP: full Windows desktop (port 3389) | OpenSSH, PuTTY, Microsoft Remote Desktop | Admins managing servers; help desks |

### Bonus

| Component | What it is | What it does | Examples | Where used |
|---|---|---|---|---|
| Virtualization | A hypervisor that runs many virtual computers on one machine | Shares CPU, memory and storage between VMs and builds virtual switches | VMware ESXi, Hyper-V, Proxmox VE | Server rooms, data centres, home labs |
| Cloud networking | Networks built through a cloud provider's website or code | Creates virtual networks, subnets, firewall rules and load balancers with no hardware | AWS VPC, Azure Virtual Network, Google Cloud VPC | Businesses hosting apps online |
| SDN controller | A central software "brain" that programs switches and routers | Separates decisions from hardware so the whole network is managed from one place | OpenDaylight, ONOS, Cisco ACI, VMware NSX | Large data centres, campuses, ISPs |

## Part C: Interaction diagram

```
 ┌────────────┐        ┌────────────┐        ┌──────────────────────────────┐
 │ Client PC  │◄──────►│ ③ Firewall │◄──────►│ Server (Windows / Linux)     │
 │ browser,   │        │ allow 443, │        │  ① DHCP – hands out IPs      │
 │ DHCP/DNS   │        │ block rest │        │  ② DNS  – names → IPs        │
 │ client     │        │            │        │  ④ Web / file server         │
 └─────┬──────┘        └─────┬──────┘        └──────────────┬───────────────┘
       │                     │                              │
 ══════╧═════════════════════╧══════════════════════════════╧══════════════
   TCP/IP at the core: every request and reply travels as IP packets (TCP/UDP)
```

Flow: ① DHCP gives the client an address → ② DNS finds the server's IP → ③ the firewall checks the traffic → ④ the web/file server replies.

## Part D: Summary

Network software turns cables and Wi-Fi signals into real communication: every device runs a TCP/IP stack that breaks data into addressed packets and makes sure they arrive. DHCP is essential because it gives each device a working IP address automatically, so a laptop can join a network in seconds without manual setup. DNS matters just as much, because people remember names like google.com, not numbers, and without it almost no website or online service could be found. Servers, firewalls, VPNs and monitoring tools then build on these basics to share resources, keep attackers out and help administrators fix problems. In my opinion, the TCP/IP stack is the most important component, because every other service here, from DNS to web servers to Wireshark, depends on it to send even one message. If DHCP or DNS fails, people can still connect by typing addresses by hand, but without TCP/IP nothing can talk at all. That is why TCP/IP sits at the centre of the diagram and of every modern network.
