"use client";

import { useState } from "react";
import {
  Users,
  Plus,
  Search,
  Building,
  Phone,
  Mail,
  MapPin,
  X,
  FileText,
} from "lucide-react";

export type ClientRow = {
  id: string;
  name: string;
  cui: string | null;
  reg_com: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  notes: string | null;
  created_at: string;
};

type Props = {
  initialClients: ClientRow[];
};

export default function ClientsClient({ initialClients }: Props) {
  const [clients, setClients] = useState<ClientRow[]>(initialClients);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [cui, setCui] = useState("");
  const [regCom, setRegCom] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [notes, setNotes] = useState("");

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/seller/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          cui,
          regCom,
          phone,
          email,
          address,
          city,
          county,
          notes,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Eroare la adăugare");
        return;
      }

      const newClient: ClientRow = {
        id: data.client.id,
        name,
        cui: cui || null,
        reg_com: regCom || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        city: city || null,
        county: county || null,
        notes: notes || null,
        created_at: data.client.created_at,
      };

      setClients((prev) => [newClient, ...prev]);
      setIsModalOpen(false);
      // Reset form
      setName("");
      setCui("");
      setRegCom("");
      setPhone("");
      setEmail("");
      setAddress("");
      setCity("");
      setCounty("");
      setNotes("");
    } catch (err: any) {
      alert(err.message || "Eroare de rețea");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredClients = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.cui && c.cui.includes(searchQuery)) ||
      (c.phone && c.phone.includes(searchQuery)) ||
      (c.city && c.city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 text-neutral-400 w-4 h-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Caută client după nume, CUI, telefon..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 bg-[#0D0D0D] hover:bg-neutral-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition"
        >
          <Plus size={16} /> Adaugă Client Nou
        </button>
      </div>

      <div className="bg-white border border-[#E5E5E5] rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F7F7F8] border-b border-[#E5E5E5] text-xs font-bold text-neutral-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Nume Client / Companie</th>
                <th className="px-6 py-4">CUI / CIF</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Localitate</th>
                <th className="px-6 py-4">Adresă</th>
                <th className="px-6 py-4 text-right">Dată Înregistrare</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredClients.map((c) => {
                const dateStr = new Date(c.created_at).toLocaleDateString("ro-RO", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                });

                return (
                  <tr key={c.id} className="hover:bg-[#F7F7F8]/60 transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-[#0D0D0D] flex items-center gap-2">
                        <Building className="w-4 h-4 text-violet-600 shrink-0" />
                        {c.name}
                      </div>
                      {c.reg_com && (
                        <div className="text-[11px] text-neutral-400 font-mono pl-6">
                          {c.reg_com}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-neutral-700">
                      {c.cui || "—"}
                    </td>
                    <td className="px-6 py-4 text-xs text-neutral-600">
                      {c.phone && (
                        <div className="flex items-center gap-1.5 font-medium">
                          <Phone size={12} className="text-neutral-400" /> {c.phone}
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-1.5 text-neutral-500">
                          <Mail size={12} className="text-neutral-400" /> {c.email}
                        </div>
                      )}
                      {!c.phone && !c.email && "—"}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-neutral-700">
                      {c.city ? `${c.city}${c.county ? `, ${c.county}` : ""}` : "—"}
                    </td>
                    <td className="px-6 py-4 text-xs text-neutral-500 truncate max-w-xs">
                      {c.address || "—"}
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-neutral-400 font-mono">
                      {dateStr}
                    </td>
                  </tr>
                );
              })}

              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-neutral-400 text-sm">
                    Niciun client găsit. Apasă pe &ldquo;Adaugă Client Nou&rdquo; pentru a salva primul client în ERP!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Adaugă Client */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-4">
              <div className="flex items-center gap-2 text-lg font-black text-[#0D0D0D]">
                <Users className="w-5 h-5 text-violet-600" />
                Adaugă Client Nou (ERP)
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                  Nume Client sau Denumire Firmă *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: SC Alfa SRL sau Popescu Ion"
                  className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    CUI / CIF
                  </label>
                  <input
                    type="text"
                    value={cui}
                    onChange={(e) => setCui(e.target.value)}
                    placeholder="RO12345678"
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    Nr. Reg. Com.
                  </label>
                  <input
                    type="text"
                    value={regCom}
                    onChange={(e) => setRegCom(e.target.value)}
                    placeholder="J40/1234/2020"
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    Telefon
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07xxxxxxxx"
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@email.ro"
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    Oraș / Localitate
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="București"
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    Județ / Sector
                  </label>
                  <input
                    type="text"
                    value={county}
                    onChange={(e) => setCounty(e.target.value)}
                    placeholder="Ilfov"
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                  Adresă completă
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Strada, Număr, Bloc, Apartament"
                  className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 text-xs font-bold hover:bg-neutral-50"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {submitting ? "Se salvează..." : "Salvează Clientul"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
