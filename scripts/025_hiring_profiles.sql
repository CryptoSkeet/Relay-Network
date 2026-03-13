-- Agent Hiring Profiles System
-- Two-sided marketplace for agent labor: businesses post standing offers, agents apply and get paid per task

-- Hiring Profiles (business side)
CREATE TABLE IF NOT EXISTS hiring_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_handle TEXT UNIQUE NOT NULL,
  verified_business BOOLEAN DEFAULT false,
  logo_url TEXT,
  description TEXT,
  website TEXT,
  total_paid_usdc DECIMAL(18,6) DEFAULT 0,
  active_offers_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Standing Offers (job listings)
CREATE TABLE IF NOT EXISTS standing_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hiring_profile_id UUID NOT NULL REFERENCES hiring_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'code-review', 'data-analysis', 'content-generation', 
    'research', 'qa-testing', 'translation', 'summarization', 'custom'
  )),
  required_capabilities TEXT[] DEFAULT '{}',
  min_reputation INT DEFAULT 0,
  required_tier TEXT DEFAULT 'unverified' CHECK (required_tier IN (
    'unverified', 'human-verified', 'onchain-verified'
  )),
  payment_per_task_usdc DECIMAL(18,6) NOT NULL CHECK (payment_per_task_usdc > 0),
  max_tasks_per_agent_per_day INT DEFAULT 10,
  max_total_tasks INT, -- null = unlimited
  tasks_completed INT DEFAULT 0,
  escrow_balance_usdc DECIMAL(18,6) DEFAULT 0,
  auto_approve BOOLEAN DEFAULT true,
  acceptance_criteria TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  stripe_payment_intent_id TEXT, -- For tracking escrow deposits
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Applications
CREATE TABLE IF NOT EXISTS agent_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES standing_offers(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'rejected', 'working', 'completed', 'failed'
  )),
  tasks_completed INT DEFAULT 0,
  total_earned_usdc DECIMAL(18,6) DEFAULT 0,
  applied_at TIMESTAMPTZ DEFAULT now(),
  last_task_at TIMESTAMPTZ,
  -- Prevent duplicate applications
  UNIQUE(offer_id, agent_id)
);

-- Task Submissions (individual completed tasks)
CREATE TABLE IF NOT EXISTS task_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES agent_applications(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES standing_offers(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  submission_content TEXT NOT NULL,
  ai_validation_result JSONB, -- {passed: boolean, reason: string, confidence: number}
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'paid'
  )),
  payment_amount_usdc DECIMAL(18,6),
  stripe_transfer_id TEXT, -- For tracking payouts
  submitted_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_standing_offers_status ON standing_offers(status);
CREATE INDEX IF NOT EXISTS idx_standing_offers_task_type ON standing_offers(task_type);
CREATE INDEX IF NOT EXISTS idx_standing_offers_hiring_profile ON standing_offers(hiring_profile_id);
CREATE INDEX IF NOT EXISTS idx_agent_applications_offer ON agent_applications(offer_id);
CREATE INDEX IF NOT EXISTS idx_agent_applications_agent ON agent_applications(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_applications_status ON agent_applications(status);
CREATE INDEX IF NOT EXISTS idx_task_submissions_application ON task_submissions(application_id);
CREATE INDEX IF NOT EXISTS idx_task_submissions_agent ON task_submissions(agent_id);

-- Enable RLS
ALTER TABLE hiring_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE standing_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hiring_profiles
CREATE POLICY "hiring_profiles_select_all" ON hiring_profiles 
  FOR SELECT USING (true);

CREATE POLICY "hiring_profiles_insert_own" ON hiring_profiles 
  FOR INSERT WITH CHECK (auth.uid() = business_id);

CREATE POLICY "hiring_profiles_update_own" ON hiring_profiles 
  FOR UPDATE USING (auth.uid() = business_id);

-- RLS Policies for standing_offers
CREATE POLICY "standing_offers_select_active" ON standing_offers 
  FOR SELECT USING (true);

CREATE POLICY "standing_offers_insert_own" ON standing_offers 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM hiring_profiles 
      WHERE id = hiring_profile_id AND business_id = auth.uid()
    )
  );

CREATE POLICY "standing_offers_update_own" ON standing_offers 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM hiring_profiles 
      WHERE id = hiring_profile_id AND business_id = auth.uid()
    )
  );

-- RLS Policies for agent_applications
CREATE POLICY "agent_applications_select_all" ON agent_applications 
  FOR SELECT USING (true);

CREATE POLICY "agent_applications_insert_agent" ON agent_applications 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents WHERE id = agent_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "agent_applications_update_agent" ON agent_applications 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM agents WHERE id = agent_id AND user_id = auth.uid()
    )
  );

-- RLS Policies for task_submissions
CREATE POLICY "task_submissions_select_all" ON task_submissions 
  FOR SELECT USING (true);

CREATE POLICY "task_submissions_insert_agent" ON task_submissions 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents WHERE id = agent_id AND user_id = auth.uid()
    )
  );

-- Function to update active_offers_count on hiring_profiles
CREATE OR REPLACE FUNCTION update_active_offers_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      UPDATE hiring_profiles SET active_offers_count = active_offers_count + 1 
      WHERE id = NEW.hiring_profile_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active' AND NEW.status != 'active' THEN
      UPDATE hiring_profiles SET active_offers_count = active_offers_count - 1 
      WHERE id = NEW.hiring_profile_id;
    ELSIF OLD.status != 'active' AND NEW.status = 'active' THEN
      UPDATE hiring_profiles SET active_offers_count = active_offers_count + 1 
      WHERE id = NEW.hiring_profile_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'active' THEN
      UPDATE hiring_profiles SET active_offers_count = active_offers_count - 1 
      WHERE id = OLD.hiring_profile_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_active_offers_count
AFTER INSERT OR UPDATE OR DELETE ON standing_offers
FOR EACH ROW EXECUTE FUNCTION update_active_offers_count();

-- Function to update hiring_profile total_paid when a task is paid
CREATE OR REPLACE FUNCTION update_hiring_profile_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    -- Update standing offer tasks_completed and escrow
    UPDATE standing_offers SET 
      tasks_completed = tasks_completed + 1,
      escrow_balance_usdc = escrow_balance_usdc - NEW.payment_amount_usdc
    WHERE id = NEW.offer_id;
    
    -- Update hiring profile total paid
    UPDATE hiring_profiles SET 
      total_paid_usdc = total_paid_usdc + NEW.payment_amount_usdc
    WHERE id = (SELECT hiring_profile_id FROM standing_offers WHERE id = NEW.offer_id);
    
    -- Update agent application totals
    UPDATE agent_applications SET 
      tasks_completed = tasks_completed + 1,
      total_earned_usdc = total_earned_usdc + NEW.payment_amount_usdc,
      last_task_at = NOW()
    WHERE id = NEW.application_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_hiring_totals
AFTER INSERT OR UPDATE ON task_submissions
FOR EACH ROW EXECUTE FUNCTION update_hiring_profile_totals();

-- Enable Realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE standing_offers;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_applications;
ALTER PUBLICATION supabase_realtime ADD TABLE task_submissions;
