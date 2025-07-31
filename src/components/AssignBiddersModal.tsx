import React, { useState, useEffect, useCallback } from 'react';
import { X, Users, Plus, Minus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ProfileWithDetailsRPC } from '../lib/supabase';
import { toast } from 'react-hot-toast';

interface AssignBiddersModalProps {
  profile: ProfileWithDetailsRPC;
  onClose: () => void;
  onAssignmentsUpdated: () => void;
}

interface Bidder {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

const AssignBiddersModal: React.FC<AssignBiddersModalProps> = ({ 
  profile, 
  onClose, 
  onAssignmentsUpdated 
}) => {
  const [availableBidders, setAvailableBidders] = useState<Bidder[]>([]);
  const [assignedBidders, setAssignedBidders] = useState<Bidder[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(false);

  const loadBiddersAndAssignments = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get all available bidders
      const { data: allBidders, error: biddersError } = await supabase.rpc('get_all_bidders');
      if (biddersError) throw biddersError;

      // Get current assignments for this profile
      const { data: assignments, error: assignmentsError } = await supabase
        .from('profile_assignments')
        .select('bidder_id')
        .eq('profile_id', profile.id);
      
      if (assignmentsError) throw assignmentsError;

      const assignedBidderIds = assignments?.map(a => a.bidder_id) || [];
      
             // Filter out already assigned bidders
       const available = allBidders?.filter((bidder: Bidder) => !assignedBidderIds.includes(bidder.id)) || [];
       const assigned = allBidders?.filter((bidder: Bidder) => assignedBidderIds.includes(bidder.id)) || [];

      setAvailableBidders(available);
      setAssignedBidders(assigned);
    } catch (error) {
      console.error('Error loading bidders and assignments:', error);
      toast.error('Failed to load bidders');
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  // Load available bidders and current assignments
  useEffect(() => {
    loadBiddersAndAssignments();
  }, [loadBiddersAndAssignments]);

  

  const handleAssignBidder = async (bidder: Bidder) => {
    try {
      setAssigning(true);
      
      const { error } = await supabase.rpc('create_profile_assignment', {
        p_profile_id: profile.id,
        p_bidder_id: bidder.id,
        p_assigned_by: (await supabase.auth.getUser()).data.user?.id
      });

      if (error) throw error;

      // Update local state
      setAssignedBidders(prev => [...prev, bidder]);
      setAvailableBidders(prev => prev.filter(b => b.id !== bidder.id));
      
      toast.success(`${bidder.first_name || bidder.email} assigned to profile`);
      onAssignmentsUpdated();
    } catch (error) {
      console.error('Error assigning bidder:', error);
      toast.error('Failed to assign bidder');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveBidder = async (bidder: Bidder) => {
    try {
      setRemoving(true);
      
      // Get the assignment ID
      const { data: assignment, error: findError } = await supabase
        .from('profile_assignments')
        .select('id')
        .eq('profile_id', profile.id)
        .eq('bidder_id', bidder.id)
        .single();
      
      if (findError) throw findError;

      // Delete the assignment
      const { error } = await supabase.rpc('delete_profile_assignment', {
        p_assignment_id: assignment.id
      });

      if (error) throw error;

      // Update local state
      setAvailableBidders(prev => [...prev, bidder]);
      setAssignedBidders(prev => prev.filter(b => b.id !== bidder.id));
      
      toast.success(`${bidder.first_name || bidder.email} removed from profile`);
      onAssignmentsUpdated();
    } catch (error) {
      console.error('Error removing bidder:', error);
      toast.error('Failed to remove bidder');
    } finally {
      setRemoving(false);
    }
  };

  const getBidderDisplayName = (bidder: Bidder) => {
    return bidder.first_name && bidder.last_name 
      ? `${bidder.first_name} ${bidder.last_name}`
      : bidder.email;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full">
          <div className="p-6">
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Assign Bidders to Profile
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {profile.first_name} {profile.last_name} - {profile.email}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Available Bidders */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-4 flex items-center">
                <Users className="w-4 h-4 mr-2" />
                Available Bidders ({availableBidders.length})
              </h4>
              {availableBidders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No available bidders</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableBidders.map((bidder) => (
                    <div
                      key={bidder.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {getBidderDisplayName(bidder)}
                        </p>
                        <p className="text-xs text-gray-600">{bidder.email}</p>
                      </div>
                      <button
                        onClick={() => handleAssignBidder(bidder)}
                        disabled={assigning}
                        className="flex items-center space-x-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="text-sm">Assign</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assigned Bidders */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-4 flex items-center">
                <Users className="w-4 h-4 mr-2" />
                Assigned Bidders ({assignedBidders.length})
              </h4>
              {assignedBidders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No assigned bidders</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {assignedBidders.map((bidder) => (
                    <div
                      key={bidder.id}
                      className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {getBidderDisplayName(bidder)}
                        </p>
                        <p className="text-xs text-gray-600">{bidder.email}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveBidder(bidder)}
                        disabled={removing}
                        className="flex items-center space-x-1 text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        <Minus className="w-4 h-4" />
                        <span className="text-sm">Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignBiddersModal; 