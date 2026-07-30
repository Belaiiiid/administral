import json
from app.modules.ai.fraud.fusion import DetectorEvidence, fuse
from app.modules.ai.fraud.schemas import FraudAnalysisSchema

def test_depreciation_and_convergence():
    print("--- Test 1: Convergent Unaligned Signals (Failing Scenario) ---")
    trufor_evidence = DetectorEvidence(
        detector="trufor", status="APPLICABLE", raw_score=0.887, confidence=0.30, explanation="TruFor test", regions=[], limitations=[]
    )
    ela_evidence = DetectorEvidence(
        detector="ela", status="APPLICABLE", raw_score=0.925, confidence=0.45, explanation="ELA test", regions=[], limitations=[]
    )
    noise_evidence = DetectorEvidence(
        detector="noise", status="APPLICABLE", raw_score=1.0, confidence=0.45, explanation="Noise test", regions=[], limitations=[]
    )
    
    fused_convergent = fuse([trufor_evidence, ela_evidence, noise_evidence])
    
    # Assertions for convergent case
    trufor_contrib = next(c for c in fused_convergent["contributions"] if c["detector"] == "trufor")
    assert trufor_contrib["depreciation_applied"] is True, "TruFor should have depreciation applied"
    assert "corroborée globalement (convergence de 3 détecteurs)" in trufor_contrib["depreciation_reason"]
    
    print(f"Convergent scoreFinal: {fused_convergent['score_final']}")
    print(f"Convergent niveauRisque: {fused_convergent['niveau_risque']}")
    assert fused_convergent["niveau_risque"] in {"MODERE", "ELEVE"}, "Risk level should be at least MODERE for 3 high convergent signals"

    print("\n--- Test 2: Negative Case (Single Low-Quality Scan) ---")
    noise_only = DetectorEvidence(
        detector="noise", status="APPLICABLE", raw_score=0.75, confidence=0.45, explanation="Noise test", regions=[], limitations=[]
    )
    trufor_low = DetectorEvidence(
        detector="trufor", status="APPLICABLE", raw_score=0.20, confidence=0.30, explanation="TruFor test", regions=[], limitations=[]
    )
    
    fused_negative = fuse([noise_only, trufor_low])
    
    noise_contrib = next(c for c in fused_negative["contributions"] if c["detector"] == "noise")
    assert noise_contrib["depreciation_applied"] is True, "Noise should have depreciation applied"
    assert noise_contrib["depreciation_reason"] == "Preuve visuelle non corroborée ou zones masquées par le filtre de présentation."
    
    print(f"Negative scoreFinal: {fused_negative['score_final']}")
    print(f"Negative niveauRisque: {fused_negative['niveau_risque']}")
    assert fused_negative["niveau_risque"] == "FAIBLE", "Risk level should remain FAIBLE for single noise signal < 0.8"
    
    print("\n--- Test 3: Single High-Confidence Unlocalized ---")
    trufor_high_single = DetectorEvidence(
        detector="trufor", status="APPLICABLE", raw_score=0.95, confidence=0.30, explanation="TruFor test", regions=[], limitations=[]
    )
    
    noise_low = DetectorEvidence(
        detector="noise", status="APPLICABLE", raw_score=0.50, confidence=0.45, explanation="Noise test", regions=[], limitations=[]
    )
    fused_single_high = fuse([trufor_high_single, noise_low])
    
    trufor_contrib_high = next(c for c in fused_single_high["contributions"] if c["detector"] == "trufor")
    print(f"TruFor reason: {trufor_contrib_high['depreciation_reason']}")
    assert "score brut suffisamment" in trufor_contrib_high["depreciation_reason"]
    
    print(f"Single High scoreFinal: {fused_single_high['score_final']}")
    
    print("\nALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_depreciation_and_convergence()
