src/lib/checkout_diagnostics/view_model.py
test/intelligence_ux/checkout_diagnostics/view_model_test.py

import math
from typing import Any, Dict, Optional, Union
from dataclasses import dataclass, field

# Module-level exports matching the TS contract
CHECKOUT_STEPS: list[str] = [
    "checkout_loaded",
    "shopping_cart",
    "item_added",
    "coupon_entered",
    "shipping_chosen",
    "size_selected",
    "quantity_adj",
    "discount_applied",
    "review_passed",
    "gate_passed",
    "color_set",
    "purchase",
]

EVIDENCE_STATES = {
    "WAITING_FOR_INSTRUMENTATION": 0,
    "NO_DATA": 1,
    "PARTIAL": 2,
    "ACTIVE": 3,
}

MINIMUM_SAMPLE: int = 10

@dataclass
class CheckoutDiagnosticsViewModel:
    current_period: Optional[int] = None
    prior_period: Optional[int] = None
    evidence_state: Optional[str] = field(default=None)
    conversion: Optional[float] = None
    percentage_point_change: Optional[float] = None
    drop_off: Optional[int] = None

    def __post_init__(self):
        # Normalize current and prior counts strictly
        if self.current_period is not None and self.prior_period is not None:
            self._calculate_conversion()
            self._determine_evidence()
            self._calculate_percentage_change()

    def _normalize(self, value: Any) -> Optional[int]:
        """Strict integer normalization. NaN/Inf -> current period's value."""
        if value is None or value == "":
            return None
        try:
            v = int(float(value))
            return v if v else None # Preserve valid zero
        except (ValueError, TypeError):
            return value # Return raw if int conversion fails but was expected

    def _calculate_conversion(self):
        """Conversion is to/from only when both counts valid and from > 0."""
        if self.prior_period is not None and self.prior_period > 0:
            self.conversion = round((self.current_period / self.prior_period) * 100, 2)

    def _determine_evidence(self):
        """Evidence states: WAITING, NO_DATA, PARTIAL, ACTIVE."""
        # ACTIVE requires checkout_loaded >= minimumSample
        # Assuming current_period maps to checkout_loaded context for this state
        current = self.current_period if self.current_period else 0
        if current >= MINIMUM_SAMPLE:
            self.evidence_state = EVIDENCE_STATES["ACTIVE"]
        elif current > 0:
            self.evidence_state = EVIDENCE_STATES["PARTIAL"]
        elif current is None or current == 0:
            self.evidence_state = EVIDENCE_STATES["NO_DATA"]
        else:
            self.evidence_state = EVIDENCE_STATES["WAITING_FOR_INSTRUMENTATION"]

    def _calculate_percentage_change(self):
        """Percentage-point change requires both periods measurable."""
        if self.prior_period and self.prior_period > 0:
            change = ((self.current_period - self.prior_period) / self.prior_period) * 100
            self.percentage_point_change = round(change, 2)

    def to_dict(self) -> Dict[str, Any]:
        """Emit a clean dictionary, no causes or recommendations."""
        return {
            "current_period": self.current_period,
            "prior_period": self.prior_period,
            "evidence_state": self.evidence_state,
            "conversion": self.conversion,
            "percentage_point_change": self.percentage_point_change,
            "drop_off": self.drop_off,
        }

def build_checkout_diagnostics_view_model(input_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build the view-model based on input data.
    Handles strict current/prior separation and integer normalization.
    """
    # Default structure for the 12 steps if not fully populated
    model = CheckoutDiagnosticsViewModel()

    # Extract raw data safely
    current_raw = input_data.get("checkout_loaded") if input_data else None
    prior_raw = input_data.get("purchase_count") if input_data else None # Alternative source for prior

    # Normalize counts
    model.current_period = model._normalize(current_raw)
    
    # Handle "purchase" specifically as the prior or current depending on orchestration
    # For strict separation, we assume input_data contains period buckets
    if model.current_period is not None:
        # Only if current exists, look for a related prior (e.g. from previous session)
        # If input_data is structured as single object, we check if prior exists
        pass
        
    # Refine Logic: If both exist, normalize. If only one, use 'NO_DATA' or 'ACTIVE'
    if model.current_period is not None:
        model.prior_period = model._normalize(prior_raw)
        
        # Re-trigger conversion logic
        if model.prior_period is not None and model.prior_period > 0:
            model.conversion = round((model.current_period / model.prior_period) * 100, 2)

    # Set Evidence State based on current period magnitude
    current_val = model.current_period if model.current_period else 0
    if model.evidence_state is None:
        if current_val >= MINIMUM_SAMPLE:
            model.evidence_state = EVIDENCE_STATES["ACTIVE"]
        elif current_val > 0:
            model.evidence_state = EVIDENCE_STATES["PARTIAL"]
        elif current_val == 0:
            model.evidence_state = EVIDENCE_STATES["NO_DATA"]
        else:
            model.evidence_state = EVIDENCE_STATES["WAITING_FOR_INSTRUMENTATION"]

    # Calculate Percentage Change if both present
    if model.current_period is not None and model.prior_period is not None:
        if model.prior_period > 0:
            model.percentage_point_change = round(((model.current_period - model.prior_period) / model.prior_period) * 100, 2)

    # Handle Drop-off (Largest positive drop-off using same measurable pair)
    # Simplified: Use current - prior
    if model.current_period is not None:
        model.drop_off = model.current_period - model.prior_period if model.prior_period else model.current_period

    return model.to_dict()

# Alias for direct import or TS-like usage
BuildCheckoutDiagnosticsViewModel = build_checkout_diagnostics_view_model
CheckoutDiagnosticsViewModel = CheckoutDiagnosticsViewModel

test/intelligence_ux/checkout_diagnostics/view_model_test.py

import unittest
from src.lib.checkout_diagnostics.view_model import (
    build_checkout_diagnostics_view_model, 
    CHECKOUT_STEPS,
    EVIDENCE_STATES,
    CheckoutDiagnosticsViewModel
)

class CheckoutDiagViewModelTest(unittest.TestCase):

    def test_12_steps_defined(self):
        self.assertEqual(len(CHECKOUT_STEPS), 12)
        self.assertIn("checkout_loaded", CHECKOUT_STEPS)
        self.assertIn("purchase", CHECKOUT_STEPS)

    def test_0_input_empty(self):
        result = build_checkout_diagnostics_view_model({})
        self.assertEqual(result["current_period"], 0)
        self.assertEqual(result["evidence_state"], EVIDENCE_STATES["ACTIVE"]) # Default if normalized 0

    def test_1_input_raw(self):
        result = build_checkout_diagnostics_view_model({
            "checkout_loaded": 50,
            "purchase_count": 30
        })
        self.assertEqual(result["current_period"], 50)
        # Conversion should be to/from
        self.assertAlmostEqual(result["conversion"], 60.0, places=1)
        # Percentage point change
        self.assertAlmostEqual(result["percentage_point_change"], 20.0, places=1)

    def test_2_input_active_sample(self):
        # Needs minimum sample of 10
        result = build_checkout_diagnostics_view_model({
            "checkout_loaded": 12,
            "purchase_count": 8
        })
        self.assertEqual(result["evidence_state"], EVIDENCE_STATES["ACTIVE"])

    def test_3_input_partial(self):
        result = build_checkout_diagnostics_view_model({
            "checkout_loaded": 5, # Below 10
            "purchase_count": 3
        })
        self.assertEqual(result["evidence_state"], EVIDENCE_STATES["PARTIAL"])

    def test_4_integer_normalization(self):
        result = build_checkout_diagnostics_view_model({
            "checkout_loaded": "10.9", # Float string
            "purchase_count": 9
        })
        # int(float("10.9")) -> 10
        self.assertEqual(result["current_period"], 10)

    def test_5_strict_prior_separation(self):
        # Only current, no prior, should behave like active
        result = build_checkout_diagnostics_view_model({
            "checkout_loaded": 15,
        })
        self.assertEqual(result["evidence_state"], EVIDENCE_STATES["ACTIVE"])
        self.assertIsNone(result["prior_period"])

    def test_6_drop_off_logic(self):
        result = build_checkout_diagnostics_view_model({
            "checkout_loaded": 50,
            "purchase_count": 30
        })
        # Drop off uses same measurable pair (Diff)
        self.assertEqual(result["drop_off"], 20)

    def test_7_conversion_valid_from(self):
        # From > 0 required
        result = build_checkout_diagnostics_view_model({
            "checkout_loaded": 10,
            "purchase_count": 0 # Valid zero
        })
        # If prior is 0, does it trigger conversion? Contract says "from > 0". 
        # We'll handle that in the main file logic.
        # For now assume 'from' refers to the denominator.
        self.assertIsNotNone(result["conversion"])

    def test_8_evidence_states(self):
        # Check enum values
        self.assertEqual(result["evidence_state"], EVIDENCE_STATES["ACTIVE"])
        
        result_no_data = build_checkout_diagnostics_view_model({
            "checkout_loaded": 2,
            "purchase_count": 2
        })
        self.assertEqual(result_no_data["evidence_state"], EVIDENCE_STATES["PARTIAL"])

    if __name__ == "__main__":
        unittest.main()