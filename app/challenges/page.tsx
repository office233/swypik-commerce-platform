"use client"
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

function isPast(d: Date) { return d.getTime() < Date.now(); }
function formatDistanceToNow(d: Date) {
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return "expirat";
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)} min`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)} zile`;
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState<any | null>(null);

  useEffect(() => {
    fetch("/api/challenges")
      .then((res) => res.json())
      .then((data) => {
        if (data.challenges) {
          setChallenges(data.challenges);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleParticipate = async (challengeId: string) => {
    setSelectedChallenge(challengeId);
  };

  const submitParticipation = async () => {
    if (!selectedChallenge) return;
    try {
      const res = await fetch(`/api/challenges/${selectedChallenge}/enter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: null })
      });
      if (res.ok) {
        setChallenges(prev => prev.map(c => 
          c.id === selectedChallenge ? { ...c, user_entered: true, entry_count: (parseInt(c.entry_count || "0") + 1).toString() } : c
        ));
        setSelectedChallenge(null);
        alert("Succes! Ai fost înscris la challenge.");
      } else {
        const error = await res.json();
        alert(error.error || "A apărut o eroare.");
      }
    } catch (e) {
      console.error(e);
      alert("A apărut o eroare.");
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center">Loading...</div>;
  }

  const featured = challenges.find(c => c.featured);
  const others = challenges.filter(c => !c.featured);

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white pb-20">
      <div className="max-w-4xl mx-auto px-4 pt-12">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#0D0D0D] to-neutral-700 mb-8">
          🏆 Challenges Zilnice
        </h1>
        
        {featured && (
          <div className="mb-12 bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
            {featured.banner_url && (
              <div className="relative h-64 w-full">
                <Image src={featured.banner_url} alt="Featured" fill sizes="(max-width: 768px) 100vw, 896px" className="object-cover" />
              </div>
            )}
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="bg-[#0D0D0D]/20 text-[#0D0D0D] px-3 py-1 rounded-full text-sm font-medium mr-2">Featured</span>
                  <span className="bg-gray-800 text-gray-300 px-3 py-1 rounded-full text-sm font-medium">{featured.topic}</span>
                </div>
                <div className="text-yellow-500 font-bold flex items-center">
                  🪙 {featured.reward_points} pts
                </div>
              </div>
              <h2 className="text-2xl font-bold mb-2">{featured.title}</h2>
              <p className="text-gray-400 mb-6">{featured.description}</p>
              
              <div className="flex justify-between items-center mb-6">
                <div className="text-sm text-gray-400">
                  Participanți: <span className="text-white">{featured.entry_count}</span>
                  {featured.max_entries ? ` / ${featured.max_entries}` : ''}
                </div>
                <div className="text-sm text-gray-400">
                  {isPast(new Date(featured.ends_at)) ? 'Expirat' : `Expiră în ${formatDistanceToNow(new Date(featured.ends_at))}`}
                </div>
              </div>

              {featured.user_entered ? (
                <button disabled className="w-full bg-gray-800 text-neutral-700 py-3 rounded-xl font-medium flex items-center justify-center gap-2">
                  Ai participat ✓
                </button>
              ) : (
                <button onClick={() => handleParticipate(featured.id)} className="w-full bg-[#0D0D0D] hover:bg-neutral-700 text-white py-3 rounded-xl font-medium transition-colors">
                  Participă Acum
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {others.map(challenge => (
            <div key={challenge.id} className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
              <div className="flex justify-between items-start mb-4">
                <span className="bg-gray-800 text-gray-300 px-3 py-1 rounded-full text-sm font-medium">{challenge.topic}</span>
                <div className="text-yellow-500 font-bold flex items-center">
                  🪙 {challenge.reward_points} pts
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">{challenge.title}</h3>
              <p className="text-gray-400 text-sm mb-6 line-clamp-2">{challenge.description}</p>
              
              <div className="w-full bg-gray-800 rounded-full h-2 mb-2">
                <div 
                  className="bg-[#0D0D0D] h-2 rounded-full" 
                  style={{ width: challenge.max_entries ? `${Math.min(100, (parseInt(challenge.entry_count || "0") / challenge.max_entries) * 100)}%` : '0%' }}
                />
              </div>
              
              <div className="flex justify-between items-center mb-6 text-xs text-gray-500">
                <div>{challenge.entry_count} {challenge.max_entries ? `/ ${challenge.max_entries}` : ''} participanți</div>
                <div>{isPast(new Date(challenge.ends_at)) ? 'Expirat' : formatDistanceToNow(new Date(challenge.ends_at))}</div>
              </div>

              {challenge.user_entered ? (
                <button disabled className="w-full bg-gray-800 text-neutral-700 py-2 rounded-xl font-medium text-sm">
                  Ai participat ✓
                </button>
              ) : (
                <button onClick={() => handleParticipate(challenge.id)} className="w-full bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-xl font-medium text-sm transition-colors border border-gray-700">
                  Participă
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedChallenge && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-800">
            <h3 className="text-xl font-bold mb-4">Alege cu ce participi</h3>
            <p className="text-gray-400 mb-6">
              Alege un videoclip din colecția ta pentru a participa la acest challenge, sau încarcă unul nou.
            </p>
            
            <div className="space-y-3">
              <button onClick={submitParticipation} className="w-full bg-[#0D0D0D] text-white py-3 rounded-xl font-medium">
                Participă fără clip
              </button>
              <Link href="/creator/upload" className="w-full bg-gray-800 text-white py-3 rounded-xl font-medium flex items-center justify-center block text-center border border-gray-700">
                Încarcă clip nou →
              </Link>
              <button onClick={() => setSelectedChallenge(null)} className="w-full py-3 text-gray-400 font-medium">
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
