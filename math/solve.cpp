// Build: c++ -O3 -std=c++17 math/solve.cpp -o /tmp/spur-solve
// Run from the repository root: /tmp/spur-solve
// Requires GCC or Clang for __int128. All comparisons, calibration, and totals are exact.
#include <algorithm>
#include <array>
#include <cassert>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <stdexcept>
#include <string>
#include <vector>

using I = std::int64_t;
using Wide = __int128_t;
constexpr I L = 7669695; // lcm of choose(47,d), d=0..5
constexpr int HANDS = 2598960;
constexpr I DENOM = L * HANDS;
struct Award { I base = 0; I royals = 0; I squared = 0; };
struct Policy { I base=0, royals=0; Wide squared=0; };
struct Fraction { I n, d; };
std::array<std::vector<Award>,6> subtotal;
int choose[53][6]{}, sizeOf[32]{}, high[32]{}, prev[32]{}, multiplier[32]{};
enum class Game { Jacks, Deuces, DoubleDouble };
enum Hand { Nothing, HighPair, TwoPair, ThreeKind, Straight, Flush, FullHouse,
    FourKind, StraightFlush, Royal, FourDeuces, WildRoyal, FiveKind,
    FourAcesKicker, FourLowKicker, FourAces, FourLow, Categories };
using Counts = std::array<I, Categories>;
struct Classifications { Counts histogram{}; std::uint32_t fingerprint = 2166136261U; };
const std::array<int, Categories> jacksPay = {0,1,2,3,4,6,9,25,50};
const std::array<int, Categories> deucesPay = {0,0,0,1,2,2,3,5,9,0,200,25,15};
const std::array<int, Categories> doubleDoublePay = {0,1,1,3,4,6,10,50,50,0,0,0,0,400,160,160,80};
const Counts jacksCounts = {2062860,337920,123552,54912,10200,5108,3744,624,36,4};
const Counts deucesCounts = {2119728,0,0,355080,62232,14472,12672,31552,2068,4,48,480,624};
const Counts doubleDoubleCounts = {2062860,337920,123552,54912,10200,5108,3744,432,36,4,0,0,0,12,36,36,108};
std::vector<unsigned char> hints(HANDS);

Fraction reduce(I n, I d) {
    I g=std::gcd(n,d);
    return {n/g,d/g};
}

template<class Callback> void allHands(Callback f) {
    int ordinal=0;
    for (int e=4;e<52;e++)
    for (int d=3;d<e;d++)
    for (int c=2;c<d;c++)
    for (int b=1;b<c;b++)
    for (int a=0;a<b;a++)
        f(std::array<int,5>{a,b,c,d,e},ordinal++);
    assert(ordinal==HANDS);
}

bool fitsStraight(int ranks) {
    if ((ranks & 4111) == ranks) return true; // A,2,3,4,5
    for (int high = 4; high < 13; ++high) {
        if ((ranks & (31 << (high - 4))) == ranks) return true;
    }
    return false;
}

Hand category(const std::array<int,5>& hand, Game game) {
    int counts[13]{}, ranks = 0, wild = 0;
    int firstSuit = -1;
    bool flush = true;
    for (int card : hand) {
        const int rank = card / 4;
        if (game == Game::Deuces && rank == 0) {
            ++wild;
            continue;
        }
        ++counts[rank];
        ranks |= 1 << rank;
        const int suit = card % 4;
        if (firstSuit == -1) firstSuit = suit;
        else if (suit != firstSuit) flush = false;
    }
    const int distinct = __builtin_popcount((unsigned)ranks);
    const bool straight = distinct == (5 - wild) && fitsStraight(ranks);
    const int broadway = 31 << 8;
    const bool royal = flush && (ranks & broadway) == ranks;

    int pairs = 0, trips = 0, largest = 0, quad = -1;
    bool highPair = false;
    for (int rank = 0; rank < 13; ++rank) {
        const int count = counts[rank];
        largest = std::max(largest, count);
        if (count == 4) quad = rank;
        if (count == 3) ++trips;
        if (count == 2) { ++pairs; highPair |= rank >= 9; }
    }

    if (game == Game::Deuces) {
        if (wild == 4) return FourDeuces;
        if (royal) return wild ? WildRoyal : Royal;
        if (largest + wild == 5) return FiveKind;
        if (flush && straight) return StraightFlush;
        if (largest + wild == 4) return FourKind;
        if (distinct == 2) return FullHouse;
        if (flush) return Flush;
        if (straight) return Straight;
        return largest + wild == 3 ? ThreeKind : Nothing;
    }
    if (royal && straight) return Royal;
    if (flush && straight) return StraightFlush;
    if (quad >= 0) {
        if (game != Game::DoubleDouble || (quad > 2 && quad < 12)) return FourKind;
        const int kicker = (hand.front() / 4 == quad) ? hand.back() / 4 : hand.front() / 4;
        if (quad == 12) return kicker <= 2 ? FourAcesKicker : FourAces;
        return (kicker <= 2 || kicker == 12) ? FourLowKicker : FourLow;
    }
    if (trips && pairs) return FullHouse;
    if (flush) return Flush;
    if (straight) return Straight;
    if (trips) return ThreeKind;
    if (pairs == 2) return TwoPair;
    return highPair ? HighPair : Nothing;
}

void indices(const std::array<int,5>& cards, int (&idx)[32]) {
    idx[0]=0;
    for(int mask=1;mask<32;mask++)
        idx[mask]=idx[prev[mask]]+choose[cards[high[mask]]][sizeOf[mask]];
}

Classifications prepare(Game game, const std::array<int, Categories>& pay) {
    for(int n=0;n<=52;n++){
        choose[n][0]=1;
        if (n) for(int k=1;k<=5;k++) choose[n][k]=choose[n-1][k]+choose[n-1][k-1];
    }
    for(int k=0;k<=5;k++) subtotal[k].assign(choose[52][k], {});
    for(int mask=0;mask<32;mask++) {
        sizeOf[mask]=__builtin_popcount((unsigned)mask);
        multiplier[mask]=L/choose[47][5-sizeOf[mask]];
        if(mask){ high[mask]=31-__builtin_clz((unsigned)mask); prev[mask]=mask^(1<<high[mask]);}
    }
    Classifications outcomes;
    allHands([&](const auto& cards,int ordinal){
        int idx[32]; indices(cards,idx); assert(idx[31]==ordinal);
        const Hand cat=category(cards,game);
        ++outcomes.histogram[cat];
        outcomes.fingerprint = (outcomes.fingerprint ^ cat) * 16777619U;
        for(int mask=0;mask<32;mask++) {
            auto &val=subtotal[sizeOf[mask]][idx[mask]];
            val.base+=pay[cat]; val.royals+=(cat==Royal);
            val.squared+=I(pay[cat])*pay[cat];
        }
    });
    return outcomes;
}

Policy optimum(Fraction royal) {
    Policy aggregate;
    allHands([&](const auto& cards,int ordinal){
        int idx[32]; indices(cards,idx);
        Award exact[32];
        for(int mask=0;mask<32;mask++) exact[mask]=subtotal[sizeOf[mask]][idx[mask]];
        // Möbius inversion on the 5-card deal transforms "includes" into "holds exactly".
        // Thus every discarded card is excluded from the replacement deck.
        for(int bit=1;bit<32;bit*=2) {
            for(int block=0;block<32;block+=bit*2) {
                for(int j=block;j<block+bit;j++) {
                    exact[j].base-=exact[j+bit].base;
                    exact[j].royals-=exact[j+bit].royals;
                    exact[j].squared-=exact[j+bit].squared;
                }
            }
        }
        Wide top=-1; int pick=0;
        for(int m=0;m<32;m++){
            const auto x=exact[m];
            const Wide normalized=(Wide(x.base)*royal.d+Wide(x.royals)*royal.n)*multiplier[m];
            if(normalized>top){top=normalized;pick=m;}
        }
        aggregate.base+=I(exact[pick].base)*multiplier[pick];
        aggregate.royals+=I(exact[pick].royals)*multiplier[pick];
        aggregate.squared+=Wide(exact[pick].squared)*multiplier[pick];
        hints[ordinal]=static_cast<unsigned char>(pick);
    });
    return aggregate;
}

// Simple PackBits-like encoding. Short reads and long runs are cheap to decode on older phones.
void writeHints(const std::string& variant){
    const std::string filename = variant == "jacks" ? "holds.bin" : variant + "-holds.bin";
    std::ofstream out("dist/math/" + filename,std::ios::binary);
    auto run=[](size_t i){
        size_t len=1;
        while(i+len<hints.size() && len<130 && hints[i+len]==hints[i]) ++len;
        return len;
    };
    for(size_t pos=0;pos<hints.size();){
        size_t n=run(pos);
        if(n>=3){out.put(char(128+(n-3)));out.put(char(hints[pos]));pos+=n;}
        else {
            size_t start=pos++;
            while(pos<hints.size() && pos-start<128 && run(pos)<3) ++pos;
            out.put(char(pos-start-1));
            out.write(reinterpret_cast<const char*>(&hints[start]),pos-start);
        }
    }
    assert(out.good());
}

void calibrate(Game game, const std::string& variant, const std::array<int, Categories>& pay,
    const Counts& expected, double benchmark, std::ostream& config) {
    const auto outcomes = prepare(game, pay);
    assert(outcomes.histogram == expected);
    const auto base = optimum({800,1});
    const auto conventional = reduce(base.base + 800*base.royals,DENOM);
    const double conventionalReturn = double(conventional.n) / conventional.d;
    std::cerr << std::setprecision(14) << variant << " benchmark " << conventionalReturn
              << " (" << conventional.n << "/" << conventional.d << ")\n";
    assert(std::abs(conventionalReturn - benchmark) < 0.0000005);
    Fraction r{1300,1};
    for (int i=0; i<12; i++) {
        const Policy p = optimum(r);
        const Fraction root = reduce(101*DENOM - 100*p.base, 100*p.royals);
        std::cerr << variant << " expected royal " << double(r.n)/r.d
                  << " -> " << double(root.n)/root.d << "\n";
        if (root.n == r.n && root.d == r.d) {
            assert(Wide(100)*(Wide(p.base)*r.d + Wide(p.royals)*r.n) == Wide(101)*DENOM*r.d);
            const auto bonus = reduce(r.n%r.d, r.d);
            const std::string prefix = variant == "jacks" ? "" : variant + "-";
            config << "globalThis." << (variant == "jacks" ? "SilverSpurCalibration"
                    : variant == "deuces" ? "SilverSpurDeucesCalibration" : "SilverSpurDoubleDoubleCalibration")
                   << " = Object.freeze({ royalLow: " << r.n/r.d << ", upperNumerator: '"
                   << bonus.n << "', upperDenominator: '" << bonus.d << "' });\n";
            assert(config.good());
            std::ofstream report("math/" + prefix + "verification.json");
            report << "{\n  \"deals\": " << HANDS << ", \"holdsPerDeal\": 32, \"drawDenominatorLcm\": " << L << ",\n"
                   << "  \"standardReturnNumerator\": " << conventional.n << ", \"standardReturnDenominator\": " << conventional.d << ",\n"
                   << "  \"nonroyalWeightedSum\": " << p.base << ", \"royalWeightedFrequency\": " << p.royals << ", \"weightDenominator\": " << DENOM << ",\n"
                   << "  \"royalMeanNumerator\": " << r.n << ", \"royalMeanDenominator\": " << r.d << ",\n"
                   << "  \"optimalReturnNumerator\": 101, \"optimalReturnDenominator\": 100";
            if (game != Game::Jacks) report << ",\n  \"classificationFingerprint\": " << outcomes.fingerprint;
            report << "\n}\n";
            assert(report.good());
            writeHints(variant);
            return;
        }
        r = root;
    }
    throw std::runtime_error("Royal prize calibration did not converge for " + variant);
}

// The custom-paytable CLI reuses this verified exact solver without recalibrating the original game.
#ifndef SPUR_NO_MAIN
int main() {
    std::ofstream config("dist/math/calibration.js");
    config << "// Generated by math/solve.cpp. The exact fractions are sampled only on a natural royal flush.\n";
    calibrate(Game::Jacks, "jacks", jacksPay, jacksCounts, 0.99543904, config);
    calibrate(Game::Deuces, "deuces", deucesPay, deucesCounts, 1.007620, config);
    calibrate(Game::DoubleDouble, "doubleDouble", doubleDoublePay, doubleDoubleCounts, 1.000670, config);
}
#endif
