// SPDX-License-Identifier: AGPL-3.0-or-later
// CPD owns C++ tokenization. This adapter exports ranges and identities, never source text.
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import com.google.gson.*;
import net.sourceforge.pmd.cpd.*;
import net.sourceforge.pmd.lang.cpp.CppLanguageModule;
import net.sourceforge.pmd.lang.document.*;

public class CpdBridge {
    static final Gson JSON = new Gson();
    static final CppLanguageModule CPP = CppLanguageModule.getInstance();

    static String fingerprint(FileLocation range, int expected, Map<Path, Tokens> cache) throws Exception {
        Path path = Path.of(range.getFileId().getAbsolutePath());
        Tokens tokens = cache.get(path);
        if (tokens == null) {
            try (TextDocument doc = TextDocument.create(TextFile.forPath(path, StandardCharsets.UTF_8, CPP.getDefaultVersion()))) {
                tokens = CpdLexer.tokenize(CPP.createCpdLexer(CPP.newPropertyBundle()), doc);
                cache.put(path, tokens);
            }
        }
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        int count = 0;
        for (TokenEntry token : tokens.getTokens()) {
            if (token.isEof()) continue;
            if (token.getBeginLine() < range.getStartLine() || token.getBeginLine() == range.getStartLine()
                    && token.getBeginColumn() < range.getStartColumn()) continue;
            if (token.getEndLine() > range.getEndLine() || token.getEndLine() == range.getEndLine()
                    && token.getEndColumn() > range.getEndColumn()) continue;
            byte[] bytes = token.getImage(tokens).getBytes(StandardCharsets.UTF_8);
            digest.update(ByteBuffer.allocate(4).putInt(bytes.length).array());
            digest.update(bytes);
            count++;
        }
        if (count != expected) throw new IllegalStateException("CPD token range does not match its token count");
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format("%02x", value & 255));
        return hex.toString();
    }

    public static void main(String[] args) throws Exception {
        JsonObject request = JsonParser.parseString(Files.readString(Path.of(args[0]))).getAsJsonObject();
        CPDConfiguration config = new CPDConfiguration();
        config.setOnlyRecognizeLanguage(CPP);
        config.setMinimumTileSize(request.get("minimum_tokens").getAsInt());
        try (CpdAnalysis analysis = CpdAnalysis.create(config)) {
            for (JsonElement file : request.getAsJsonArray("files")) {
                if (!analysis.files().addFile(Path.of(file.getAsString())))
                    throw new IllegalStateException("CPD rejected an input file: " + file.getAsString());
            }
            analysis.performAnalysis(report -> {
                if (!report.getProcessingErrors().isEmpty())
                    throw new IllegalStateException("CPD source processing failed: " + report.getProcessingErrors());
                Map<Path, Tokens> cache = new HashMap<>();
                Map<String, JsonObject> groups = new TreeMap<>();
                try {
                    for (Match match : report.getMatches()) {
                        String hash = null;
                        JsonArray occurrences = new JsonArray();
                        for (Mark mark : match) {
                            FileLocation range = mark.getLocation();
                            String current = fingerprint(range, match.getTokenCount(), cache);
                            if (hash != null && !hash.equals(current))
                                throw new IllegalStateException("CPD match token identities disagree");
                            hash = current;
                            JsonObject item = new JsonObject();
                            item.addProperty("path", range.getFileId().getAbsolutePath());
                            item.addProperty("line", range.getStartLine());
                            item.addProperty("column", range.getStartColumn());
                            item.addProperty("end_line", range.getEndLine());
                            item.addProperty("end_column", range.getEndColumn());
                            occurrences.add(item);
                        }
                        JsonObject group = groups.get(hash);
                        if (group == null) {
                            group = new JsonObject();
                            group.addProperty("fingerprint", hash);
                            group.addProperty("tokens", match.getTokenCount());
                            group.add("occurrences", new JsonArray());
                            groups.put(hash, group);
                        }
                        for (JsonElement item : occurrences)
                            if (!group.getAsJsonArray("occurrences").contains(item)) group.getAsJsonArray("occurrences").add(item);
                        if (groups.size() > 20000) throw new IllegalStateException("CPD observation limit reached");
                    }
                    JsonObject output = new JsonObject();
                    output.add("groups", JSON.toJsonTree(groups.values()));
                    JsonArray processed = new JsonArray();
                    report.getNumberOfTokensPerFile().keySet().forEach(file -> processed.add(file.getAbsolutePath()));
                    output.add("processed", processed);
                    Files.writeString(Path.of(args[1]), JSON.toJson(output), StandardCharsets.UTF_8);
                } catch (Exception error) {
                    throw new IllegalStateException("Cannot export exact CPD evidence", error);
                }
            });
        }
    }
}
