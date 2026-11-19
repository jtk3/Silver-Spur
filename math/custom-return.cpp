// Exact optimal-play return and single-hand payout variance for a fixed integer paytable.
// Build: c++ -O3 -std=c++17 math/custom-return.cpp -o custom-return
// Run: ./custom-return jacks royal=800 fullHouse=9 flush=6
#define SPUR_NO_MAIN
#include "solve.cpp"
#include <map>
#include <limits>
#include <cstdlib>
#include <sstream>

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: custom-return jacks|deuces|doubleDouble [category=nonnegative_integer ...]\n"
                  << "Defaults are the reference paytable with an 800-credit royal.\n";
        return 2;
    }
    try {
        std::string variant=argv[1];
        Game game;
        std::array<int, Categories> pay{};
        std::map<std::string,Hand> fields;
        if (variant=="jacks") {
            game=Game::Jacks;pay=jacksPay;
            fields={{"jacks",HighPair},{"twoPair",TwoPair},{"threeKind",ThreeKind},
                {"straight",Straight},{"flush",Flush},{"fullHouse",FullHouse},
                {"fourKind",FourKind},{"straightFlush",StraightFlush},{"royal",Royal}};
        } else if (variant=="deuces") {
            game=Game::Deuces;pay=deucesPay;
            fields={{"threeKind",ThreeKind},{"straight",Straight},{"flush",Flush},
                {"fullHouse",FullHouse},{"fourKind",FourKind},{"straightFlush",StraightFlush},
                {"fiveKind",FiveKind},{"wildRoyal",WildRoyal},{"fourDeuces",FourDeuces},{"royal",Royal}};
        } else if (variant=="doubleDouble") {
            game=Game::DoubleDouble;pay=doubleDoublePay;
            fields={{"jacks",HighPair},{"twoPair",TwoPair},{"threeKind",ThreeKind},
                {"straight",Straight},{"flush",Flush},{"fullHouse",FullHouse},
                {"fourKind",FourKind},{"straightFlush",StraightFlush},
                {"fourAcesKicker",FourAcesKicker},{"fourLowKicker",FourLowKicker},
                {"fourAces",FourAces},{"fourLow",FourLow},{"royal",Royal}};
        } else throw std::invalid_argument("Unknown variant");
        int royal=800;
        for (int i=2;i<argc;i++) {
            const std::string arg=argv[i]; auto pos=arg.find('=');
            if (pos==std::string::npos || pos==0 || pos==arg.size()-1)
                throw std::invalid_argument("Expected key=integer argument: "+arg);
            const std::string key=arg.substr(0,pos), value=arg.substr(pos+1);
            const auto it=fields.find(key);
            if (it==fields.end()) throw std::invalid_argument("Unknown category: "+key);
            if (value.find_first_not_of("0123456789") != std::string::npos)
                throw std::invalid_argument("Invalid nonnegative integer for "+key);
            const auto amount=std::stoll(value);
            if (amount>100000) throw std::out_of_range("Maximum award is 100000");
            if (it->second==Royal) royal=static_cast<int>(amount);
            else pay[it->second]=static_cast<int>(amount);
        }
        const auto classes=prepare(game,pay);
        const auto optimal=optimum({royal,1});
        const long double mean=(static_cast<long double>(optimal.base)+
            static_cast<long double>(royal)*optimal.royals)/DENOM;
        const long double second=(static_cast<long double>(optimal.squared)+
            static_cast<long double>(royal)*royal*optimal.royals)/DENOM;
        const long double variance=std::max(0.0L,second-mean*mean);
        std::cout << std::setprecision(12)
                  << "Game: "<<variant<<"\nInitial hands: "<<HANDS
                  << "\nRoyal payout per credit: "<<royal
                  << "\nOptimal return: "<<100*mean<<"%\n"
                  << "Expected credits paid per credit wagered: "<<mean<<"\n"
                  << "Variance (one unit wagered, including return): "<<variance<<"\n"
                  << "Standard deviation: "<<std::sqrt(variance)<<"\n"
                  << "Expected net profit per unit wagered: "<<mean-1<<"\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "Error: "<<e.what()<<"\n";return 2;
    }
}
