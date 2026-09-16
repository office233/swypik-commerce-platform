/**
 * Swypik Squad Buy (Group Buying viral stil Pinduoduo).
 * 
 * Permite utilizatorilor să cumpere produse cu discount de grup (-25% până la -35%)
 * formând un Squad de 2 persoane în maxim 24 de ore.
 */
import { dbQuery, withTransaction } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface SquadGroup {
    id: string;
    product_id: string;
    creator_user_id: string | null;
    creator_name: string;
    creator_avatar: string | null;
    required_members: number;
    current_members: number;
    squad_price_cents: number;
    regular_price_cents: number;
    currency: string;
    status: "active" | "completed" | "expired";
    expires_at: string;
    created_at: string;
    product_title?: string;
    product_image?: string;
}

export interface SquadMember {
    id: string;
    squad_id: string;
    user_id: string | null;
    user_name: string;
    user_avatar: string | null;
    joined_at: string;
    status: string;
}

export async function createSquadGroup(input: {
    productId: string;
    userId?: string | null;
    userName?: string;
    userAvatar?: string | null;
}): Promise<{ squad: SquadGroup; shareUrl: string } | null> {
    const { rows: products } = await dbQuery(
        `SELECT id, title, price_cents, images FROM marketplace_products WHERE id = $1 AND status = 'active'`,
        [input.productId],
    );
    const product = products[0];
    if (!product) return null;

    const regularCents = product.price_cents || 10000;
    // Discount standard Squad: 30% reducere
    const squadCents = Math.round(regularCents * 0.7);
    const creatorName = input.userName?.trim() || "Cumpărător Swypik";

    const squad = await withTransaction(async (q) => {
        const { rows: sRows } = await q(
            `INSERT INTO squad_groups (
                product_id, creator_user_id, creator_name, creator_avatar,
                required_members, current_members, squad_price_cents, regular_price_cents,
                currency, status, expires_at
            ) VALUES ($1, $2, $3, $4, 2, 1, $5, $6, 'RON', 'active', now() + interval '24 hours')
            RETURNING *`,
            [product.id, input.userId || null, creatorName, input.userAvatar || null, squadCents, regularCents],
        );
        const newSquad = sRows[0];

        await q(
            `INSERT INTO squad_members (squad_id, user_id, user_name, user_avatar)
             VALUES ($1, $2, $3, $4)`,
            [newSquad.id, input.userId || null, creatorName, input.userAvatar || null],
        );

        return newSquad;
    });

    const shareUrl = `/squad/${squad.id}`;
    return { squad, shareUrl };
}

export async function getSquadDetails(squadId: string): Promise<{
    squad: SquadGroup;
    members: SquadMember[];
    product: { id: string; title: string; image: string; price_cents: number };
} | null> {
    const { rows: squadRows } = await dbQuery(
        `SELECT s.*, p.title as product_title, p.images as product_images
           FROM squad_groups s
           JOIN marketplace_products p ON p.id = s.product_id
          WHERE s.id = $1`,
        [squadId],
    );
    const squad = squadRows[0];
    if (!squad) return null;

    // Verifică dacă a expirat între timp
    if (squad.status === "active" && new Date(squad.expires_at) < new Date()) {
        await dbQuery(`UPDATE squad_groups SET status = 'expired' WHERE id = $1`, [squadId]);
        squad.status = "expired";
    }

    const { rows: members } = await dbQuery(
        `SELECT * FROM squad_members WHERE squad_id = $1 ORDER BY joined_at ASC`,
        [squadId],
    );

    const firstImage = Array.isArray(squad.product_images) ? squad.product_images[0] : "";

    return {
        squad: {
            ...squad,
            product_title: squad.product_title,
            product_image: firstImage,
        },
        members,
        product: {
            id: squad.product_id,
            title: squad.product_title,
            image: firstImage,
            price_cents: squad.regular_price_cents,
        },
    };
}

export async function joinSquadGroup(input: {
    squadId: string;
    userId?: string | null;
    userName?: string;
    userAvatar?: string | null;
}): Promise<{ success: boolean; error?: string; squad?: SquadGroup }> {
    const details = await getSquadDetails(input.squadId);
    if (!details) return { success: false, error: "Squad inexistent" };

    const { squad } = details;
    if (squad.status === "completed") return { success: false, error: "Squad-ul este deja completat!" };
    if (squad.status === "expired" || new Date(squad.expires_at) < new Date()) {
        return { success: false, error: "Acest Squad a expirat." };
    }

    const memberName = input.userName?.trim() || "Prieten Squad";

    const updated = await withTransaction(async (q) => {
        await q(
            `INSERT INTO squad_members (squad_id, user_id, user_name, user_avatar)
             VALUES ($1, $2, $3, $4)`,
            [squad.id, input.userId || null, memberName, input.userAvatar || null],
        );

        const newCount = squad.current_members + 1;
        const newStatus = newCount >= squad.required_members ? "completed" : "active";

        const { rows } = await q(
            `UPDATE squad_groups
                SET current_members = $1, status = $2, updated_at = now()
              WHERE id = $3
              RETURNING *`,
            [newCount, newStatus, squad.id],
        );

        return rows[0];
    });

    return { success: true, squad: updated };
}

export async function getActiveSquads(limit = 10): Promise<SquadGroup[]> {
    const { rows } = await dbQuery(
        `SELECT s.*, p.title as product_title, p.images as product_images
           FROM squad_groups s
           JOIN marketplace_products p ON p.id = s.product_id
          WHERE s.status = 'active' AND s.expires_at > now()
          ORDER BY s.created_at DESC
          LIMIT $1`,
        [limit],
    );

    return rows.map((r: any) => ({
        ...r,
        product_image: Array.isArray(r.product_images) ? r.product_images[0] : "",
    }));
}

export async function getActiveSquadsForProduct(productId: string, limit = 5): Promise<SquadGroup[]> {
    const { rows } = await dbQuery(
        `SELECT s.*, p.title as product_title, p.images as product_images
           FROM squad_groups s
           JOIN marketplace_products p ON p.id = s.product_id
          WHERE s.product_id = $1 AND s.status = 'active' AND s.expires_at > now()
          ORDER BY s.created_at DESC
          LIMIT $2`,
        [productId, limit],
    );

    return rows.map((r: any) => ({
        ...r,
        product_image: Array.isArray(r.product_images) ? r.product_images[0] : "",
    }));
}

export async function getSquadsForSeller(sellerId: string, limit = 50): Promise<{
    squads: SquadGroup[];
    stats: {
        totalSquads: number;
        activeSquads: number;
        completedSquads: number;
        viralOrdersCount: number;
        extraRevenueCents: number;
    };
}> {
    const { rows } = await dbQuery(
        `SELECT s.*, p.title as product_title, p.images as product_images
           FROM squad_groups s
           JOIN marketplace_products p ON p.id = s.product_id
          WHERE p.seller_id = $1
          ORDER BY s.created_at DESC
          LIMIT $2`,
        [sellerId, limit],
    );

    const squads: SquadGroup[] = rows.map((r: any) => ({
        ...r,
        product_image: Array.isArray(r.product_images) ? r.product_images[0] : "",
    }));

    const totalSquads = squads.length;
    const activeSquads = squads.filter((s) => s.status === "active").length;
    const completedSquads = squads.filter((s) => s.status === "completed").length;
    // Fiecare squad completat aduce 2 comenzi virale
    const viralOrdersCount = completedSquads * 2;
    const extraRevenueCents = squads
        .filter((s) => s.status === "completed")
        .reduce((sum, s) => sum + (s.squad_price_cents * s.current_members), 0);

    return {
        squads,
        stats: {
            totalSquads,
            activeSquads,
            completedSquads,
            viralOrdersCount,
            extraRevenueCents,
        },
    };
}

