export async function tryHandleMemoryCommand({
  cleanedContent,
  channelId,
  message,
  memoriesRepo,
  log,
  runId,
}) {
    // COMMAND: mem edit <id> <novo conteúdo>
    const memEditMatch = cleanedContent.match(/^mem\s+edit\s+(\d+)\s+(.+)$/i);
    if (memEditMatch) {
        const id = parseInt(memEditMatch[1], 10);
        const content = memEditMatch[2].trim();

        if (!content) {
            await message.reply("ℹ️ Conteúdo vazio. Usa: mem edit <id> <novo conteúdo>");
            return true;
        }

        if (content.length > 2000) {
            await message.reply("ℹ️ Conteúdo demasiado longo (máx: 2000 caracteres).");
            return true;
        }

        const changes = memoriesRepo.updateMemoryContent({ channelId, id, content });

        if (changes > 0) {
            await message.reply(`✏️ Memória #${id} atualizada.`);
        } else {
            await message.reply(`ℹ️ Não consegui atualizar a memória #${id} neste canal.`);
        }
        return true;
    }

    // COMMAND: mem show <id>
    // ex: mem show 1
    const memShowMatch = cleanedContent.match(/^mem\s+show\s+(\d+)$/i);
    if (memShowMatch) {
        const id = parseInt(memShowMatch[1], 10);

        const memory = memoriesRepo.getMemoryById({ channelId, id });

        if (!memory) {
            await message.reply(`ℹ️ Não encontrei a memória #${id} neste canal.`);
            return true;
        }

        const fullContent = String(memory.content || "").trim();
        const preview = fullContent.slice(0, 1500);
        const truncated = fullContent.length > 1500 ? "\n\n... (truncated)" : "";

        const createdAtIso = new Date(memory.created_at * 1000).toISOString();
        const lastUsedIso = memory.last_used_at
            ? new Date(memory.last_used_at * 1000).toISOString()
            : "-";

        await message.reply(
            `🧠 Memória #${memory.id}\n` +
            `kind: ${memory.kind}\n` +
            `salience: ${memory.salience}\n` +
            `created_at: ${memory.created_at} (${createdAtIso})\n` +
            `last_used_at: ${memory.last_used_at ?? "-"} (${lastUsedIso})\n\n` +
            `${preview}${truncated}`
        );
        return true;
    }

    // COMMAND: mem pin <id> [salience]
    // ex: mem pin 12
    // ex: mem pin 12 3.0
    const memPinMatch = cleanedContent.match(/^mem\s+pin\s+(\d+)(?:\s+([0-9]+(?:\.[0-9]+)?))?$/i);
    if (memPinMatch) {
        const id = parseInt(memPinMatch[1], 10);
        const salience = memPinMatch[2] ? parseFloat(memPinMatch[2]) : 3.0;

        if (!Number.isFinite(salience) || salience < 0 || salience > 10) {
            await message.reply("ℹ️ Salience inválido. Usa um número entre 0 e 10.");
            return true;
        }

        const changes = memoriesRepo.setMemorySalience({ channelId, id, salience });
        if (changes > 0) {
            await message.reply(`📌 Salience atualizado #${id} → ${salience}`);
        } else {
            await message.reply(`ℹ️ Não consegui atualizar a memória #${id} neste canal.`);
        }
        return true;
    }

    // COMMAND: mem rm <id>
    const memRmMatch = cleanedContent.match(/^mem\s+rm\s+(\d+)$/i);
    if (memRmMatch) {
        const id = parseInt(memRmMatch[1], 10);
        const changes = memoriesRepo.deleteMemory({ channelId, id });

        if (changes > 0) {
            await message.reply(`🗑️ Memória removida #${id}`);
        } else {
            await message.reply(`ℹ️ Não encontrei a memória #${id} neste canal.`);
        }
        return true;
    }

    // COMMAND: mem ls [kind] [n]
    // exemplos:
    //   mem ls
    //   mem ls fact
    //   mem ls fact 5
    const memLsMatch = cleanedContent.match(
        /^mem\s+ls(?:\s+(prefs|fact|note|task))?(?:\s+(\d+))?$/i
    );
    if (memLsMatch) {
        const kind = memLsMatch[1]?.toLowerCase() || null;
        const nRaw = memLsMatch[2] ? parseInt(memLsMatch[2], 10) : 5;
        const limit = Math.min(Math.max(nRaw || 5, 1), 15);

        let rows = [];
        if (kind) {
            rows = memoriesRepo.getMemoriesByKind({ channelId, kind, limit });
        } else {
            // sem kind: usa searchMemories com query vazia (vai devolver note/fact por causa do filtro)
            rows = memoriesRepo.searchMemories({ channelId, query: "", limit });
        }

        if (!rows || rows.length === 0) {
            await message.reply("ℹ️ Sem memórias para mostrar.");
            return true;
        }

        const lines = rows
            .map((m) => {
                const raw = String(m.content || "");
                const preview = raw.replace(/\s+/g, " ").trim().slice(0, 160);
                return `#${m.id} [${m.kind}] ${preview}${raw.length > 160 ? "..." : ""}`;
            })
            .join("\n");

        const header = kind ? `🧠 Memórias (${kind}):` : "🧠 Últimas memórias:";
        await message.reply(`${header}\n${lines}`);

        return true;
    }

    // COMMAND: mem (guardar memória manualmente)
    // formato: "mem <kind> <conteúdo>"
    const memMatch = cleanedContent.match(/^mem\s+(prefs|fact|note|task)\s+(.+)$/i);
    if (memMatch) {
        const kind = memMatch[1].toLowerCase();
        const content = memMatch[2].trim();

        if (!content) {
            await message.reply("ℹ️ Conteúdo vazio. Usa: mem <prefs|fact|note|task> <texto>");
            return true;
        }

        if (content.length > 2000) {
            await message.reply("ℹ️ Conteúdo demasiado longo (máx: 2000 caracteres).");
            return true;
        }

        const id = memoriesRepo.addMemory({ channelId, kind, content, salience: 1.0 });

        log("memory_added", { runId, channelId, kind, id });

        await message.reply(`✅ Memória guardada (${kind}) #${id}`);
        return true;
    }

    return false;
}